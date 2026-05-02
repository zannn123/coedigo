def analyze_student_risk(metrics):
    current_grade = _to_number(metrics.get("current_grade"))
    attendance_percentage = _to_number(metrics.get("attendance_percentage"))
    missing_activities = _to_number(metrics.get("missing_activities"))
    exam_avg = _to_number(metrics.get("exam_avg"))
    midterm_grade = _to_number(metrics.get("midterm_grade"))
    final_term_score = _to_number(metrics.get("final_term_score"))
    final_grade = _to_number(metrics.get("final_grade"))
    term_status = (metrics.get("term_performance_status") or "").strip()

    high_reasons = []
    medium_reasons = []
    known_signals = 0

    if term_status in {"subject_below_target", "final_below_target", "midterm_below_target"}:
        known_signals += 1
        if term_status == "subject_below_target":
            subject_score = current_grade
            high_reasons.append(_score_reason("combined subject performance", subject_score, "below the 75% target"))
        elif term_status == "final_below_target":
            high_reasons.append(_score_reason("final-term performance", final_term_score or current_grade, "below the 75% target"))
        elif term_status == "midterm_below_target":
            high_reasons.append(_score_reason("midterm performance", midterm_grade or current_grade, "below the 75% target"))
    elif current_grade is not None:
        known_signals += 1
        if current_grade < 75:
            high_reasons.append(f"current performance of {current_grade:.2f}%, below the 75% target")
        elif 75 <= current_grade <= 79:
            medium_reasons.append(f"current performance of {current_grade:.2f}%, between 75% and 79%")

    if final_grade is not None and str(metrics.get("remarks") or "").lower() == "failed":
        known_signals += 1
        high_reasons.append("a completed subject grade marked Failed")

    if attendance_percentage is not None:
        known_signals += 1
        if attendance_percentage < 75:
            high_reasons.append(f"attendance of {attendance_percentage:.2f}%, below 75%")
        elif 75 <= attendance_percentage <= 84:
            medium_reasons.append(f"attendance of {attendance_percentage:.2f}%, between 75% and 84%")

    if missing_activities is not None:
        known_signals += 1
        if missing_activities >= 4:
            high_reasons.append(f"{int(missing_activities)} missing activities")
        elif 2 <= missing_activities <= 3:
            medium_reasons.append(f"{int(missing_activities)} missing activities")

    if exam_avg is not None:
        known_signals += 1
        if exam_avg < 65:
            high_reasons.append(f"an exam average of {exam_avg:.2f}%, below 65%")
        elif 65 <= exam_avg <= 74:
            medium_reasons.append(f"an exam average of {exam_avg:.2f}%, between 65% and 74%")

    if high_reasons:
        return {
            "risk_level": "High Risk",
            "reason": _join_reasons(high_reasons),
            "suggested_action": "Recommend immediate consultation and completion of missing or low-scoring work.",
        }

    if medium_reasons:
        return {
            "risk_level": "Medium Risk",
            "reason": _join_reasons(medium_reasons),
            "suggested_action": "Recommend monitoring, targeted review, and early consultation if performance does not improve.",
        }

    if known_signals == 0:
        return {
            "risk_level": "Unknown",
            "reason": "There is not enough grade, attendance, or activity data to determine risk.",
            "suggested_action": "Check again after attendance, activities, or grades are encoded.",
        }

    return {
        "risk_level": "Low Risk",
        "reason": "Available grade, attendance, and activity indicators do not meet the risk thresholds.",
        "suggested_action": "Continue regular monitoring and maintain current academic performance.",
    }


def _to_number(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _join_reasons(reasons):
    if len(reasons) == 1:
        return f"The student has {reasons[0]}."
    return "The student has " + ", ".join(reasons[:-1]) + f", and {reasons[-1]}."


def _score_reason(label, value, detail):
    if value is None:
        return f"{label} {detail}"
    return f"{label} of {value:.2f}%, {detail}"
