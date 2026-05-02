import os

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from chatbot import AcademicChatbot


app = Flask(__name__)
cors_origins = [
    origin.strip()
    for origin in os.getenv("CHATBOT_CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
    if origin.strip()
]
CORS(app, resources={r"/*": {"origins": cors_origins}})
chatbot = AcademicChatbot()


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "C.O.E.D.I.G.O. Academic Assistant"})


@app.route('/static/generated_charts/<path:filename>')
def serve_chart(filename):
    """Serve generated chart images"""
    charts_dir = os.path.join(os.path.dirname(__file__), 'static', 'generated_charts')
    return send_from_directory(charts_dir, filename)


@app.post("/chat")
def chat():
    if not request.is_json:
        return jsonify({"reply": "Invalid request. Please send a JSON payload."}), 400

    payload = request.get_json(silent=True) or {}
    response = chatbot.handle_message(
        user_id=payload.get("user_id"),
        role=payload.get("role"),
        message=payload.get("message"),
        session_id=payload.get("session_id"),
    )

    status_code = response.pop("_status", 200)
    return jsonify(response), status_code


@app.post("/chat/feedback")
def chat_feedback():
    if not request.is_json:
        return jsonify({"success": False, "message": "Invalid request. Please send a JSON payload."}), 400

    payload = request.get_json(silent=True) or {}
    response = chatbot.save_feedback(
        message_id=payload.get("message_id"),
        user_id=payload.get("user_id"),
        rating=payload.get("rating"),
        feedback_text=payload.get("feedback_text"),
        corrected_intent=payload.get("corrected_intent"),
    )
    status_code = response.pop("_status", 200)
    return jsonify(response), status_code


@app.get("/chat/history")
def chat_history():
    response = chatbot.get_history(
        user_id=request.args.get("user_id"),
        role=request.args.get("role"),
        limit=request.args.get("limit", 40),
        session_id=request.args.get("session_id"),
    )
    status_code = response.pop("_status", 200)
    return jsonify(response), status_code


@app.get("/chat/sessions")
def chat_sessions():
    response = chatbot.get_sessions(
        user_id=request.args.get("user_id"),
        role=request.args.get("role"),
        limit=request.args.get("limit", 20),
    )
    status_code = response.pop("_status", 200)
    return jsonify(response), status_code


@app.delete("/chat/sessions/<session_id>")
def delete_chat_session(session_id):
    payload = request.get_json(silent=True) if request.is_json else {}
    response = chatbot.delete_session(
        user_id=(payload or {}).get("user_id") or request.args.get("user_id"),
        role=(payload or {}).get("role") or request.args.get("role"),
        session_id=session_id,
    )
    status_code = response.pop("_status", 200)
    return jsonify(response), status_code


@app.delete("/chat/history")
def clear_chat_history():
    payload = request.get_json(silent=True) if request.is_json else {}
    response = chatbot.clear_history(
        user_id=(payload or {}).get("user_id") or request.args.get("user_id"),
        role=(payload or {}).get("role") or request.args.get("role"),
    )
    status_code = response.pop("_status", 200)
    return jsonify(response), status_code


if __name__ == "__main__":
    host = os.getenv("CHATBOT_HOST", "127.0.0.1")
    port = int(os.getenv("CHATBOT_PORT", "5000"))
    debug = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(host=host, port=port, debug=debug)
