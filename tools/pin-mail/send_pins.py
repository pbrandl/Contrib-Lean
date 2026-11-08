#!/usr/bin/env python3
"""Schickt jedem Mitglied seine PIN für die Bietrunde.

Die CSV braucht die Spalten Username, Password (die PIN) und Mail; Komma oder Semikolon.
Username muss genau so geschrieben sein wie in der App, sonst findet man sich dort nicht.

  python3 send_pins.py mitglieder.csv --vorschau          nur Vorschau als Dateien, sendet nichts
  python3 send_pins.py mitglieder.csv --test du@beispiel.de  die ersten 2 Mails an diese Adresse
  python3 send_pins.py mitglieder.csv                     an alle Mitglieder

Wer erfolgreich angeschrieben wurde, steht in versendet.txt. Ein zweiter Lauf überspringt
diese Mitglieder, so bekommt nach einem Abbruch niemand die Mail doppelt.
"""

import argparse
import csv
import getpass
import html
import os
import re
import smtplib
import sys
import time
from datetime import datetime
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

# SMTP-Zugang. Das Passwort wird beim Start abgefragt (oder aus SMTP_PASSWORD gelesen).
SMTP_SERVER = 'smtp.example.org'
SMTP_PORT = 587
SMTP_USERNAME = 'bietrunde@example.org'
SENDER_EMAIL = 'Bietrunde <bietrunde@example.org>'
REPLY_TO = ''  # Adresse für Antworten, z. B. die der Organisation; leer lassen für keine

SUBJECT = 'Deine PIN für die Bietrunde'
PAUSE_SECONDS = 1.5  # zwischen zwei Mails, damit der Mailserver nicht drosselt

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, 'mail_vorlage.html')
SENT_LOG = os.path.join(HERE, 'versendet.txt')
ERROR_LOG = os.path.join(HERE, 'error_log.txt')
PREVIEW_DIR = os.path.join(HERE, 'vorschau')

COLUMNS = {
    'name': ['username', 'name'],
    'pin': ['password', 'pin'],
    'mail': ['mail', 'email', 'e-mail'],
}
PIN_PATTERN = re.compile(r'^\d{4,8}$')
MAIL_PATTERN = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def read_members(path):
    with open(path, newline='', encoding='utf-8-sig') as f:
        text = f.read()
    delimiter = ';' if text.splitlines()[0].count(';') > text.splitlines()[0].count(',') else ','
    rows = list(csv.DictReader(text.splitlines(), delimiter=delimiter))
    if not rows:
        sys.exit('Die CSV enthält keine Mitglieder.')
    headers = {h.strip().lower(): h for h in rows[0].keys() if h}
    found = {}
    for key, names in COLUMNS.items():
        match = next((headers[n] for n in names if n in headers), None)
        if not match:
            sys.exit(f'Spalte fehlt: {names[0]} (gefunden: {", ".join(rows[0].keys())})')
        found[key] = match

    members, problems = [], []
    for line, row in enumerate(rows, start=2):
        name = (row[found['name']] or '').strip()
        pin = (row[found['pin']] or '').strip()
        mail = (row[found['mail']] or '').strip()
        if not name:
            continue
        if not PIN_PATTERN.match(pin):
            problems.append(f'Zeile {line}: {name}: PIN „{pin}“ ist keine 4- bis 8-stellige Zahl')
        if not mail:
            problems.append(f'Zeile {line}: {name}: keine E-Mail-Adresse')
        elif not MAIL_PATTERN.match(mail):
            problems.append(f'Zeile {line}: {name}: E-Mail-Adresse „{mail}“ sieht ungültig aus')
        members.append({'name': name, 'pin': pin, 'mail': mail, 'line': line})
    return members, problems


def html_to_text(body):
    text = re.sub(r'<li>\s*', '- ', body)
    text = re.sub(r'<a href="(?:mailto:)?([^"]+)">[^<]*</a>', r'\1', text)
    text = re.sub(r'<h2>(.*?)</h2>', lambda m: m.group(1).upper(), text)
    text = re.sub(r'<br>\s*', '\n', text)
    text = re.sub(r'<hr>', '-' * 40, text)
    text = re.sub(r'<[^>]+>', '', text)
    text = html.unescape(text)
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip() + '\n'


def render(template, member):
    # replace instead of format(): the text may contain braces
    return (template
            .replace('{name}', html.escape(member['name']))
            .replace('{pin}', html.escape(member['pin'])))


def build_message(template, member, to_address):
    body = render(template, member)
    page = ('<!doctype html><html lang="de"><head><meta charset="utf-8"></head>'
            '<body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#14232F;max-width:640px">'
            f'{body}</body></html>')
    message = EmailMessage()
    message['From'] = SENDER_EMAIL
    message['To'] = to_address
    message['Subject'] = SUBJECT
    message['Date'] = formatdate(localtime=True)
    message['Message-ID'] = make_msgid(domain=SMTP_USERNAME.split('@')[-1])
    if REPLY_TO:
        message['Reply-To'] = REPLY_TO
    message.set_content(html_to_text(body))
    message.add_alternative(page, subtype='html')
    return message


def log_error(text):
    print(text)
    with open(ERROR_LOG, 'a', encoding='utf-8') as f:
        f.write(text + '\n')


def sent_before():
    if not os.path.exists(SENT_LOG):
        return set()
    with open(SENT_LOG, encoding='utf-8') as f:
        return {line.rstrip('\n').split('\t', 1)[-1] for line in f if line.strip()}


def main():
    parser = argparse.ArgumentParser(description='PIN-Mails für die Bietrunde verschicken.')
    parser.add_argument('csv', help='CSV mit Username, Password und Mail')
    parser.add_argument('--vorschau', action='store_true', help='nur Vorschau-Dateien schreiben, nichts senden')
    parser.add_argument('--test', metavar='ADRESSE', help='die ersten 2 Mails an diese Adresse statt an die Mitglieder')
    args = parser.parse_args()

    with open(TEMPLATE, encoding='utf-8') as f:
        template = re.sub(r'<!--.*?-->', '', f.read(), flags=re.S)  # notes in the template stay out of the mails
    members, problems = read_members(args.csv)
    print(f'{len(members)} Mitglieder gelesen.')
    if problems:
        print('\nProbleme in der CSV:')
        for p in problems:
            print('  ' + p)
        if not args.vorschau:
            sys.exit('\nBitte erst die CSV korrigieren. Mit --vorschau kannst du trotzdem schon schauen.')

    if args.vorschau:
        os.makedirs(PREVIEW_DIR, exist_ok=True)
        for m in members[:3]:
            msg = build_message(template, m, m['mail'])
            base = os.path.join(PREVIEW_DIR, re.sub(r'[^\w-]+', '_', m['name']))
            with open(base + '.html', 'w', encoding='utf-8') as f:
                f.write(msg.get_body(('html',)).get_content())
            with open(base + '.txt', 'w', encoding='utf-8') as f:
                f.write(msg.get_body(('plain',)).get_content())
        print(f'Vorschau der ersten {min(3, len(members))} Mails in {PREVIEW_DIR}/ (html und txt). Nichts gesendet.')
        return

    targets = members[:2] if args.test else members
    done = set() if args.test else sent_before()
    todo = [m for m in targets if f"{m['name']} <{m['mail']}>" not in done]
    skipped = len(targets) - len(todo)
    if skipped:
        print(f'{skipped} schon angeschrieben laut versendet.txt, werden übersprungen.')
    if not todo:
        print('Nichts zu senden.')
        return
    where = f'an {args.test} (Test)' if args.test else 'an die Mitglieder'
    if input(f'{len(todo)} Mails {where} senden? Tippe "ja": ').strip().lower() != 'ja':
        print('Abgebrochen, nichts gesendet.')
        return

    password = os.environ.get('SMTP_PASSWORD') or getpass.getpass(f'SMTP-Passwort für {SMTP_USERNAME}: ')
    with open(ERROR_LOG, 'a', encoding='utf-8') as f:
        f.write('-' * 80 + f"\nStart ({datetime.now():%Y-%m-%d %H:%M:%S}) {where}\n")

    sent = failed = 0
    with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=60) as server:
        server.starttls()
        server.login(SMTP_USERNAME, password)
        for i, m in enumerate(todo, start=1):
            to_address = args.test or m['mail']
            try:
                server.send_message(build_message(template, m, to_address))
            except smtplib.SMTPServerDisconnected:
                log_error(f"{i:03} Verbindung getrennt bei {m['name']}. Einfach noch einmal starten, der Rest folgt.")
                break
            except Exception as e:  # noqa: BLE001 - one bad address must not stop the rest
                failed += 1
                log_error(f"{i:03} Fehler bei {m['name']} <{to_address}>: {e}")
                continue
            sent += 1
            print(f"{i:03} gesendet: {m['name']} <{to_address}>")
            if not args.test:
                with open(SENT_LOG, 'a', encoding='utf-8') as f:
                    f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S}\t{m['name']} <{m['mail']}>\n")
            time.sleep(PAUSE_SECONDS)

    print(f'\nFertig: {sent} gesendet, {failed} Fehler.' + (' Details in error_log.txt.' if failed else ''))


if __name__ == '__main__':
    main()
