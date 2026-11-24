from app.services.auth import hash_password, issue_session_token, read_session_token, verify_password


def test_password_roundtrip():
    hashed = hash_password("artemsheartemshe")
    assert hashed != "artemsheartemshe"
    assert verify_password(hashed, "artemsheartemshe")
    assert not verify_password(hashed, "wrong-password!!")


def test_session_token_roundtrip():
    token = issue_session_token(42)
    assert read_session_token(token) == 42
    assert read_session_token("not.a.token") is None


def test_seeker_question_rewrites_employer_imperative():
    from app.services.rules import as_seeker_question

    q = as_seeker_question("Укажите: полная / частичная / временная / стажировка и т.п.")
    assert q.endswith("?")
    assert "укажите" not in q.lower()
    assert "занятости" in q.lower() or "полная" in q.lower()
