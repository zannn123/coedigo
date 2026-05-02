"""
Final Verification Test - Graph System
Run: python verify_graph_system.py
"""

def verify_imports():
    print("Verifying imports...")
    try:
        from chart_generator import generate_chart
        from entity_extractor import extract_entities
        from intent_detector import detect_intent
        from role_policy import is_intent_allowed
        print("✓ All imports successful\n")
        return True
    except Exception as e:
        print(f"✗ Import failed: {e}\n")
        return False


def verify_intent_detection():
    print("Verifying intent detection...")
    from intent_detector import detect_intent
    
    tests = [
        ("Create a graph of John Reyes", "student_grade_graph"),
        ("Which subjects have low grades?", "class_performance_graph"),
        ("What subject has many absences?", "class_attendance_graph"),
        ("Graph high-risk students", "class_risk_graph"),
    ]
    
    passed = 0
    for message, expected in tests:
        result = detect_intent(message, role="faculty")
        if expected in result.intent or result.intent in expected:
            print(f"✓ '{message}' → {result.intent}")
            passed += 1
        else:
            print(f"✗ '{message}' → {result.intent} (expected {expected})")
    
    print(f"Passed: {passed}/{len(tests)}\n")
    return passed == len(tests)


def verify_permissions():
    print("Verifying faculty permissions...")
    from role_policy import is_intent_allowed
    
    intents = [
        "student_grade_graph",
        "class_performance_graph",
        "class_attendance_graph",
        "class_risk_graph",
    ]
    
    passed = 0
    for intent in intents:
        if is_intent_allowed(intent, "faculty"):
            print(f"✓ Faculty can use: {intent}")
            passed += 1
        else:
            print(f"✗ Faculty CANNOT use: {intent}")
    
    print(f"Passed: {passed}/{len(intents)}\n")
    return passed == len(intents)


def verify_entity_extraction():
    print("Verifying entity extraction...")
    from entity_extractor import extract_entities
    
    tests = [
        ("Create a graph of John Reyes", "student_grade_graph", "John Reyes", None),
        ("Graph John Reyes in MATH 101", "student_grade_graph", "John Reyes", "MATH 101"),
        ("Which subjects have low grades?", "class_performance_graph", None, None),
    ]
    
    passed = 0
    for message, intent, expected_name, expected_subject in tests:
        entities = extract_entities(message, intent)
        
        name_ok = (entities.get("student_name") == expected_name)
        subject_ok = (expected_subject is None or expected_subject in str(entities.get("subject_hint") or ""))
        
        if name_ok and subject_ok:
            print(f"✓ '{message}'")
            print(f"  → student: {entities.get('student_name')}, subject: {entities.get('subject_hint')}")
            passed += 1
        else:
            print(f"✗ '{message}'")
            print(f"  → Got: {entities.get('student_name')}, {entities.get('subject_hint')}")
            print(f"  → Expected: {expected_name}, {expected_subject}")
    
    print(f"Passed: {passed}/{len(tests)}\n")
    return passed == len(tests)


def verify_directory_structure():
    print("Verifying directory structure...")
    import os
    from pathlib import Path
    
    base_dir = Path(__file__).parent
    chart_dir = base_dir / "static" / "generated_charts"
    
    if chart_dir.exists():
        print(f"✓ Chart directory exists: {chart_dir}")
        print(f"  Writable: {os.access(chart_dir, os.W_OK)}")
        return True
    else:
        print(f"✗ Chart directory missing: {chart_dir}")
        print("  Creating directory...")
        try:
            chart_dir.mkdir(parents=True, exist_ok=True)
            print("  ✓ Directory created")
            return True
        except Exception as e:
            print(f"  ✗ Failed to create: {e}")
            return False


def main():
    print("=" * 70)
    print("GRAPH SYSTEM VERIFICATION")
    print("=" * 70)
    print()
    
    results = []
    
    results.append(("Imports", verify_imports()))
    results.append(("Intent Detection", verify_intent_detection()))
    results.append(("Permissions", verify_permissions()))
    results.append(("Entity Extraction", verify_entity_extraction()))
    results.append(("Directory Structure", verify_directory_structure()))
    
    print("=" * 70)
    print("VERIFICATION SUMMARY")
    print("=" * 70)
    
    for name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status} - {name}")
    
    all_passed = all(result[1] for result in results)
    
    print()
    if all_passed:
        print("✓ ALL VERIFICATIONS PASSED!")
        print()
        print("Next steps:")
        print("1. Start server: python app.py")
        print("2. Test with faculty account:")
        print("   POST /chat")
        print("   {")
        print('     "user_id": <faculty_id>,')
        print('     "role": "faculty",')
        print('     "message": "Create a graph of John Reyes"')
        print("   }")
        print("3. Check response for graph_url")
        print("4. Access PNG image via URL")
    else:
        print("✗ SOME VERIFICATIONS FAILED")
        print("Please fix the issues above before proceeding")
    
    print("=" * 70)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit(main())
