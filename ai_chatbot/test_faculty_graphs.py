"""
Faculty Graph Test Script
Run: python test_faculty_graphs.py
"""

def test_faculty_graph_intents():
    print("Testing Faculty Graph Intent Detection...")
    from intent_detector import detect_intent
    
    test_cases = [
        # Individual student graphs
        ("Create a graph of John Reyes", "student_grade_graph", "student_graph"),
        ("Graph John Reyes performance", "student_grade_graph", "student_graph"),
        ("Show me a chart for Maria Santos", "student_grade_graph", "student_graph"),
        
        # Class performance graphs
        ("Which subjects have low grades?", "class_performance_graph", None),
        ("What subject has low grades?", "class_performance_graph", None),
        ("Graph my class performance", "class_performance_graph", None),
        ("Show class averages", "class_performance_graph", "class_summary"),
        
        # Class attendance graphs
        ("Which subject has many absences?", "class_attendance_graph", None),
        ("What subject has poor attendance?", "class_attendance_graph", None),
        ("Graph class attendance", "class_attendance_graph", None),
        ("Show attendance by subject", "class_attendance_graph", None),
        
        # Risk distribution graphs
        ("Graph high-risk students", "class_risk_graph", "high_risk_chart"),
        ("Show risk distribution", "class_risk_graph", None),
        ("Visualize student risk levels", "class_risk_graph", None),
    ]
    
    passed = 0
    failed = 0
    
    for message, expected_intent, alternate_intent in test_cases:
        result = detect_intent(message, role="faculty")
        if result.intent == expected_intent or (alternate_intent and result.intent == alternate_intent):
            print(f"✓ '{message}' -> {result.intent}")
            passed += 1
        else:
            print(f"✗ '{message}' -> {result.intent} (expected {expected_intent})")
            failed += 1
    
    print(f"\nPassed: {passed}/{len(test_cases)}")
    print(f"Failed: {failed}/{len(test_cases)}")
    print()


def test_role_permissions():
    print("Testing Role Permissions...")
    from role_policy import is_intent_allowed
    
    faculty_graph_intents = [
        "student_grade_graph",
        "class_performance_graph",
        "class_attendance_graph",
        "class_risk_graph",
        "high_risk_chart",
    ]
    
    for intent in faculty_graph_intents:
        allowed = is_intent_allowed(intent, "faculty")
        if allowed:
            print(f"✓ Faculty can use: {intent}")
        else:
            print(f"✗ Faculty CANNOT use: {intent} (THIS IS A PROBLEM!)")
    
    print()


def test_entity_extraction():
    print("Testing Entity Extraction for Faculty Graphs...")
    from entity_extractor import extract_entities
    
    test_cases = [
        ("Create a graph of John Reyes", "student_grade_graph", "John Reyes"),
        ("Graph Maria Santos performance", "student_grade_graph", "Maria Santos"),
        ("Which subjects have low grades?", "class_performance_graph", None),
        ("Graph class attendance", "class_attendance_graph", None),
    ]
    
    for message, intent, expected_name in test_cases:
        entities = extract_entities(message, intent)
        student_name = entities.get("student_name")
        
        if expected_name:
            if student_name == expected_name:
                print(f"✓ '{message}' -> student_name: {student_name}")
            else:
                print(f"✗ '{message}' -> student_name: {student_name} (expected {expected_name})")
        else:
            if not student_name:
                print(f"✓ '{message}' -> No student name (correct for class-level)")
            else:
                print(f"⚠ '{message}' -> Unexpected student_name: {student_name}")
    
    print()


def test_natural_language_flow():
    print("Testing Natural Language Conversation Flow...")
    
    scenarios = [
        {
            "name": "Individual Student Analysis",
            "messages": [
                "Create a graph of John Reyes",
                "What about his attendance?",
                "Is he at risk?",
            ]
        },
        {
            "name": "Class Performance Analysis",
            "messages": [
                "Which subjects have low grades?",
                "Show me students in MATH 101",
                "Graph the risk distribution",
            ]
        },
        {
            "name": "Attendance Monitoring",
            "messages": [
                "Which subject has many absences?",
                "Show high-risk students",
                "Create a graph of class attendance",
            ]
        },
    ]
    
    from intent_detector import detect_intent
    
    for scenario in scenarios:
        print(f"\nScenario: {scenario['name']}")
        for i, message in enumerate(scenario['messages'], 1):
            result = detect_intent(message, role="faculty")
            print(f"  {i}. '{message}'")
            print(f"     → Intent: {result.intent} (confidence: {result.confidence:.2f})")
    
    print()


def main():
    print("=" * 70)
    print("FACULTY GRAPH FUNCTIONALITY TEST")
    print("=" * 70)
    print()
    
    test_faculty_graph_intents()
    test_role_permissions()
    test_entity_extraction()
    test_natural_language_flow()
    
    print("=" * 70)
    print("TESTS COMPLETED")
    print("=" * 70)
    print()
    print("Next Steps:")
    print("1. Start chatbot server: python app.py")
    print("2. Test with faculty account:")
    print("   POST /chat")
    print("   {")
    print('     "user_id": <faculty_id>,')
    print('     "role": "faculty",')
    print('     "message": "Create a graph of John Reyes"')
    print("   }")
    print("3. Check response for graph_url")
    print("4. Access the PNG image via the URL")
    print()
    print("Example Faculty Requests:")
    print("  - 'Create a graph of John Reyes'")
    print("  - 'Which subjects have low grades?'")
    print("  - 'What subject has many absences?'")
    print("  - 'Graph high-risk students'")
    print("  - 'Show class performance chart'")


if __name__ == "__main__":
    main()
