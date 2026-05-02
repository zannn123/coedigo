import json
import math
import pickle
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from database_tools import _query_all, ensure_smart_chatbot_tables


MODELS_DIR = Path(__file__).resolve().parent / "models"
ACTIVE_MODEL_PATH = MODELS_DIR / "active_model.json"


def load_reviewed_examples():
    ensure_smart_chatbot_tables()
    return _query_all(
        """
        SELECT text, original_intent, corrected_intent, source, reviewed, created_at
        FROM chatbot_training_examples
        WHERE reviewed = 1
          AND corrected_intent IS NOT NULL
          AND corrected_intent <> ''
        ORDER BY created_at ASC
        """
    )


def retrain_intent_model():
    examples = load_reviewed_examples()
    if not examples:
        return {
            "trained": False,
            "reason": "No reviewed training examples are available.",
        }

    model = _build_naive_bayes_model(examples)
    evaluation = evaluate_model(model, examples)
    model["evaluation"] = evaluation
    model["trained_at"] = datetime.now(timezone.utc).isoformat()
    return {
        "trained": True,
        "model": model,
        "evaluation": evaluation,
        "example_count": len(examples),
    }


def save_model_version(model=None):
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    if model is None:
        result = retrain_intent_model()
        if not result.get("trained"):
            return result
        model = result["model"]

    version = datetime.now(timezone.utc).strftime("intent_model_v%Y%m%d%H%M%S.pkl")
    path = MODELS_DIR / version
    with path.open("wb") as file:
        pickle.dump(model, file)

    active_payload = {
        "active_model": version,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "deployment_note": "Manual review required before using a new model in production.",
    }
    with ACTIVE_MODEL_PATH.open("w", encoding="utf-8") as file:
        json.dump(active_payload, file, indent=2)

    return {
        "saved": True,
        "model_path": str(path),
        "active_model_path": str(ACTIVE_MODEL_PATH),
        "active_model": version,
    }


def evaluate_model(model=None, examples=None):
    if examples is None:
        examples = load_reviewed_examples()
    if model is None:
        model = _build_naive_bayes_model(examples)
    if not examples:
        return {"accuracy": None, "example_count": 0}

    correct = 0
    for example in examples:
        predicted, _confidence = predict_intent_with_model(example["text"], model)
        if predicted == example["corrected_intent"]:
            correct += 1

    return {
        "accuracy": round(correct / len(examples), 3),
        "example_count": len(examples),
    }


def load_active_model():
    if not ACTIVE_MODEL_PATH.exists():
        return None

    try:
        with ACTIVE_MODEL_PATH.open("r", encoding="utf-8") as file:
            active = json.load(file)
        model_path = MODELS_DIR / active.get("active_model", "")
        if not model_path.exists():
            return None
        with model_path.open("rb") as file:
            return pickle.load(file)
    except (OSError, pickle.PickleError, json.JSONDecodeError):
        return None


def predict_intent_with_model(text, model=None):
    model = model or load_active_model()
    if not model:
        return None, 0.0

    # Handle Scikit-Learn Model
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba([text])[0]
        classes = model.classes_
        ranked = sorted(zip(classes, probs), key=lambda x: x[1], reverse=True)
        best_intent, best_prob = ranked[0]
        
        if len(ranked) > 1:
            margin = best_prob - ranked[1][1]
            confidence = max(0.5, min(0.95, best_prob + (margin / 2)))
        else:
            confidence = best_prob
            
        return best_intent, round(confidence, 3)

    # Handle Legacy Custom Naive Bayes
    tokens = _tokens(text)
    if not tokens:
        return None, 0.0

    scores = {}
    vocabulary_size = max(1, len(model.get("vocabulary", [])))
    total_docs = max(1, model.get("total_docs", 1))

    for intent, token_counts in model.get("token_counts", {}).items():
        doc_count = model.get("intent_doc_counts", {}).get(intent, 0)
        total_tokens = model.get("intent_token_totals", {}).get(intent, 0)
        score = math.log((doc_count + 1) / (total_docs + len(model.get("token_counts", {}))))
        for token in tokens:
            score += math.log((token_counts.get(token, 0) + 1) / (total_tokens + vocabulary_size))
        scores[intent] = score

    if not scores:
        return None, 0.0

    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    best_intent, best_score = ordered[0]
    if len(ordered) == 1:
        return best_intent, 0.75

    margin = best_score - ordered[1][1]
    confidence = max(0.5, min(0.95, 0.55 + (margin / 6)))
    return best_intent, round(confidence, 3)


def _build_naive_bayes_model(examples):
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import SGDClassifier
        from sklearn.pipeline import Pipeline
        
        X = [ex["text"] for ex in examples]
        y = [ex["corrected_intent"] for ex in examples]
        
        pipeline = Pipeline([
            ('tfidf', TfidfVectorizer(token_pattern=r"(?u)\b\w+\b", ngram_range=(1, 2))),
            ('clf', SGDClassifier(loss='log_loss', penalty='l2', alpha=1e-4, random_state=42, max_iter=50, tol=None))
        ])
        pipeline.fit(X, y)
        return pipeline
    except ImportError:
        # Fallback to custom NB if scikit-learn is not available
        pass

    token_counts = defaultdict(Counter)
    intent_doc_counts = Counter()
    vocabulary = set()

    for example in examples:
        intent = example["corrected_intent"]
        tokens = _tokens(example["text"])
        if not intent or not tokens:
            continue
        intent_doc_counts[intent] += 1
        token_counts[intent].update(tokens)
        vocabulary.update(tokens)

    return {
        "type": "stdlib_multinomial_naive_bayes",
        "token_counts": {intent: dict(counts) for intent, counts in token_counts.items()},
        "intent_doc_counts": dict(intent_doc_counts),
        "intent_token_totals": {intent: sum(counts.values()) for intent, counts in token_counts.items()},
        "vocabulary": sorted(vocabulary),
        "total_docs": sum(intent_doc_counts.values()),
    }


def _tokens(text):
    return re.findall(r"[a-z0-9]+", (text or "").lower())
