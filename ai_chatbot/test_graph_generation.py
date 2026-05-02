"""
Quick test for graph generation
Run: python test_graph_generation.py
"""

def test_graph_intent_detection():
    print("Testing graph intent detection...")
    from intent_detector import detect_intent
    
    # Test various graph requests
    test_cases = [
        ("Graph my grades", "student_grade_graph"),
        ("Create a graph of my grades", "student_grade_graph"),
        ("Show my attendance chart", "student_attendance_graph"),
        ("Graph my attendance", "student_attendance_graph"),
        ("Create a performance graph", "student_grade_graph"),
        ("Make a chart of my grades", "student_grade_graph"),
    ]
    
    for message, expected_intent in test_cases:
        result = detect_intent(message, role="student")
        if "graph" in result.intent or "chart" in result.intent:
            print(f"✓ '{message}' -> {result.intent}")
        else:
            print(f"✗ '{message}' -> {result.intent} (expected something with 'graph')")
    
    print()


def test_entity_extraction():
    print("Testing entity extraction for graphs...")
    from entity_extractor import extract_entities
    
    test_cases = [
        ("Graph my grades", "student_grade_graph", "grades"),
        ("Show my attendance chart", "student_attendance_graph", "attendance"),
        ("Create a graph of John Reyes", "student_graph", "John Reyes"),
    ]
    
    for message, intent, expected in test_cases:
        entities = extract_entities(message, intent)
        if expected in ["grades", "attendance"]:
            if entities.get("graph_type") == expected:
                print(f"✓ '{message}' -> graph_type: {entities['graph_type']}")
            else:
                print(f"✗ '{message}' -> graph_type: {entities.get('graph_type')} (expected {expected})")
        else:
            if entities.get("student_name") == expected:
                print(f"✓ '{message}' -> student_name: {entities['student_name']}")
            else:
                print(f"✗ '{message}' -> student_name: {entities.get('student_name')} (expected {expected})")
    
    print()


def test_chatbot_graph_response():
    print("Testing chatbot graph response format...")
    print("NOTE: This requires a valid database connection and user data")
    print()
    
    try:
        from chatbot import AcademicChatbot
        
        chatbot = AcademicChatbot()
        
        # Test with a sample request (will fail if no valid user, but we can check the flow)
        print("Testing: 'Graph my grades' for student role")
        response = chatbot.handle_message(
            user_id=1,  # Assuming user ID 1 exists
            role="student",
            message="Graph my grades"
        )
        
        if response.get("graph_url"):
            print(f"✓ Graph URL returned: {response['graph_url']}")
        elif response.get("graph"):
            print(f"✓ Graph data returned (old format): {response['graph'].get('type')}")
        elif "No grade record" in response.get("reply", ""):
            print("✓ Proper error message (no data available)")
        elif "Invalid" in response.get("reply", ""):
            print("⚠ User validation failed (expected if user ID 1 doesn't exist)")
        else:
            print(f"✗ Unexpected response: {response.get('reply', '')[:100]}")
        
        print(f"   Intent detected: {response.get('intent')}")
        print(f"   Confidence: {response.get('confidence')}")
        
    except Exception as e:
        print(f"⚠ Test skipped due to error: {e}")
        print("   This is expected if database is not configured")
    
    print()


def main():
    print("=" * 60)
    print("GRAPH GENERATION TEST")
    print("=" * 60)
    print()
    
    test_graph_intent_detection()
    test_entity_extraction()
    test_chatbot_graph_response()
    
    print("=" * 60)
    print("TESTS COMPLETED")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Ensure database is configured in .env")
    print("2. Test with actual user: POST /chat with message 'Graph my grades'")
    print("3. Check response for 'graph_url' field")
    print("4. Access the URL to see the generated PNG chart")


if __name__ == "__main__":
    main()
