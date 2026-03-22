import logging
import os
import random
import secrets
import requests

logger = logging.getLogger(__name__)


def generate_otp_code(length: int = 5) -> str:
    """Generate a numeric OTP code using secrets for cryptographic randomness."""
    digits = "0123456789"
    # Ensure the first digit is not 0 to maintain length when parsed as int, or just use strings.
    # Since it's a string, leading zeros are fine, but random.randint avoided them.
    # Let's completely replace it:
    first_digit = secrets.choice("123456789")
    rest = "".join(secrets.choice(digits) for _ in range(length - 1))
    return first_digit + rest


def _send_otp_via_log(phone_number: str, code: str) -> None:
    """Fallback provider – just log the OTP for local testing."""
    logger.info("Sending OTP %s to %s (log provider)", code, phone_number)
    # Also print to stdout so it's always visible in the dev console,
    # even if logging is configured to hide INFO-level messages.
    print(f"[DEV OTP] {code} -> {phone_number}")


def _send_otp_via_africastalking(phone_number: str, code: str) -> None:
    """Send OTP using Africa's Talking SMS provider."""
    username = os.getenv("AFRICASTALKING_USERNAME")
    api_key = os.getenv("AFRICASTALKING_API_KEY")

    if not username or not api_key:
        logger.error(
            "Africa's Talking configuration missing. Ensure AFRICASTALKING_USERNAME and "
            "AFRICASTALKING_API_KEY are set."
        )
        _send_otp_via_log(phone_number, code)
        return

    try:
        is_sandbox = username.lower() == 'sandbox'
        url = "https://api.sandbox.africastalking.com/version1/messaging" if is_sandbox else "https://api.africastalking.com/version1/messaging"
        
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "apiKey": api_key,
        }
        
        payload = {
            "username": username,
            "to": phone_number,
            "message": f"Your HAPA verification code is {code}",
        }
        
        response = requests.post(url, headers=headers, data=payload)
        response.raise_for_status()
        
        logger.info("Sent OTP via Africa's Talking to %s", phone_number)
    except Exception as exc:
        logger.exception("Failed to send OTP via Africa's Talking: %s", exc)
        # Fallback to logging so devs can still see the code
        _send_otp_via_log(phone_number, code)


def send_otp(phone_number: str, code: str) -> None:
    """
    Send an OTP via SMS.

    Provider is selected using SMS_PROVIDER env:
    - log            -> log the OTP (development)
    - africastalking -> send via Africa's Talking
    """
    provider = os.getenv("SMS_PROVIDER", "log").lower()

    if provider == "africastalking":
        _send_otp_via_africastalking(phone_number, code)
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

