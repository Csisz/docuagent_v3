import os
import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv
from openai import OpenAI

# --- .env csak az OpenAI-hoz ---
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# --- OpenAI kliens ---
client = OpenAI(api_key=OPENAI_API_KEY)


# --- EMAIL CONFIG (HARDCODE) ---
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587

SMTP_EMAIL = "csisz.inter23@gmail.com"
SMTP_PASSWORD = "Viktusz23!"

TARGET_EMAIL = "huszarviktordev@gmail.com"


# --- EMAIL GENERÁLÁS ---
def generate_email(language="hu", email_type="invoice"):

    if language == "hu":
        prompt = f"""
Írj egy rövid, professzionális üzleti emailt magyarul.

Típus: {email_type}

Legyen:
- udvarias
- tömör
- valós céges hangvétel
"""
    else:
        prompt = f"""
Write a short professional business email in English.

Type: {email_type}

Make it:
- polite
- concise
- realistic
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a business assistant."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.7
    )

    return response.choices[0].message.content.strip()


# --- EMAIL KÜLDÉS ---
def send_email(subject, body):
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = SMTP_EMAIL
    msg["To"] = TARGET_EMAIL

    server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
    server.starttls()
    server.login(SMTP_EMAIL, SMTP_PASSWORD)

    server.send_message(msg)
    server.quit()

    print("✅ Email elküldve!")


# --- MAIN ---
if __name__ == "__main__":
    print("🚀 AI email generálás...")

    language = "hu"   # hu / en
    email_type = "invoice"  # invoice / support / meeting / generic

    email_text = generate_email(language, email_type)

    subject = "AI Teszt Email" if language == "hu" else "AI Test Email"

    print("\n--- GENERATED EMAIL ---\n")
    print(email_text)

    send_email(subject, email_text)