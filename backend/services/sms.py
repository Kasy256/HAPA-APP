import logging
import os
import random

from twilio.rest import Client

logger = logging.getLogger(__name__)


def generate_otp_code(length: int = 5) -> str:
    """Generate a numeric OTP code."""
    min_val = 10 ** (length - 1)
    max_val = (10 ** length) - 1
    return str(random.randint(min_val, max_val))


def _send_otp_via_log(phone_number: str, code: str) -> None:
    """Fallback provider – just log the OTP for local testing."""
    logger.info("Sending OTP %s to %s (log provider)", code, phone_number)
    # Also print to stdout so it's always visible in the dev console,
    # even if logging is configured to hide INFO-level messages.
    print(f"[DEV OTP] {code} -> {phone_number}")


def _send_otp_via_twilio(phone_number: str, code: str) -> None:
    """Send OTP using Twilio SMS provider."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_FROM_NUMBER")

    if not account_sid or not auth_token or not from_number:
        logger.error(
            "Twilio configuration missing. Ensure TWILIO_ACCOUNT_SID, "
            "TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER are set."
        )
        _send_otp_via_log(phone_number, code)
        return

    try:
        client = Client(account_sid, auth_token)
        message_body = f"Your HAPA verification code is {code}"
        client.messages.create(
            body=message_body,
            from_=from_number,
            to=phone_number,
        )
        logger.info("Sent OTP via Twilio to %s", phone_number)
    except Exception as exc:
        logger.exception("Failed to send OTP via Twilio: %s", exc)
        # Fallback to logging so devs can still see the code
        _send_otp_via_log(phone_number, code)


def send_otp(phone_number: str, code: str) -> None:
    """
    Send an OTP via SMS.

    Provider is selected using SMS_PROVIDER env:
    - log    -> log the OTP (development)
    - twilio -> send via Twilio
    """
    provider = os.getenv("SMS_PROVIDER", "log").lower()

    if provider == "twilio":
        _send_otp_via_twilio(phone_number, code)
    elif provider == "log":
        _send_otp_via_log(phone_number, code)
    else:
        logger.warning(
            "SMS provider %s not implemented. Falling back to log. OTP=%s phone=%s",
            provider,
            code,
            phone_number,
        )
        _send_otp_via_log(phone_number, code)

