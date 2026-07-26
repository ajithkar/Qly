"""Password policy, hashing and JWT handling."""
import pytest

from app.core.errors import AuthenticationError, ValidationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_opaque_token,
    hash_password,
    validate_password_strength,
    verify_password,
)


def test_password_hash_roundtrip():
    hashed = hash_password("CorrectHorse9")
    assert hashed != "CorrectHorse9"
    assert verify_password("CorrectHorse9", hashed)
    assert not verify_password("wrong", hashed)


@pytest.mark.parametrize(
    "bad", ["short1A", "alllowercase123", "ALLUPPERCASE123", "NoDigitsHere"]
)
def test_weak_passwords_rejected(bad):
    with pytest.raises(ValidationError):
        validate_password_strength(bad)


def test_strong_password_accepted():
    validate_password_strength("ValidPassw0rd")


def test_access_token_roundtrip():
    token = create_access_token(
        subject="user1", principal_type="staff", tenant_id="t1", role="owner"
    )
    payload = decode_token(token, expected_type="access")
    assert payload["sub"] == "user1"
    assert payload["tenant_id"] == "t1"
    assert payload["role"] == "owner"


def test_token_type_confusion_rejected():
    """A refresh token must not be usable as an access token."""
    refresh = create_refresh_token(subject="u", principal_type="user", family_id="f")
    with pytest.raises(AuthenticationError):
        decode_token(refresh, expected_type="access")


def test_tampered_token_rejected():
    token = create_access_token(subject="u", principal_type="user")
    with pytest.raises(AuthenticationError):
        decode_token(token[:-3] + "abc", expected_type="access")


def test_opaque_tokens_are_hashed_not_stored_raw():
    raw = "some-invitation-token"
    assert hash_opaque_token(raw) != raw
    assert hash_opaque_token(raw) == hash_opaque_token(raw)
