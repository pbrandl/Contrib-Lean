// German, the main language: every key exists here (en.js and es.js have the same keys).
const de = {
  app: {
    name: 'Bietrunde',
    title: 'Bietrunde · FRANZ!werk Tübingen'
  },
  common: {
    save: 'Speichern',
    cancel: 'Abbrechen',
    done: 'Fertig',
    logout: 'Abmelden',
    loading: 'Lädt',
    clearSearch: 'Suche leeren',
    notSaved: 'Nicht gespeichert.'
  },
  busy: {
    checking: 'Wird geprüft',
    saving: 'Wird gespeichert',
    adding: 'Wird eingetragen',
    deleting: 'Wird gelöscht',
    importing: 'Wird importiert',
    exporting: 'Wird erstellt'
  },
  count: {
    bids: { one: '1 Gebot', other: '{n} Gebote' },
    members: { one: '1 Mitglied', other: '{count} Mitglieder' }
  },
  time: {
    minute: 'einer Minute',
    minutes: { one: 'einer Minute', other: '{count} Minuten' },
    hours: { one: 'einer Stunde', other: '{count} Stunden' }
  },
  where: {
    line: 'Zeile {n}',
    entry: 'Eintrag {n}'
  },
  fields: {
    bid: 'Der Beitrag',
    amount: 'Der Betrag',
    gross: 'Der Bruttobetrag',
    target: 'Der Bedarf',
    hours: 'Die Stunden'
  },
  settings: {
    title: 'Einstellungen',
    open: 'Einstellungen',
    close: 'Einstellungen schließen',
    version: 'Bietrunde {version}',
    theme: {
      label: 'Darstellung',
      hint: 'Hell, dunkel oder Auto: so, wie dein Gerät eingestellt ist.',
      system: 'Auto',
      light: 'Hell',
      dark: 'Dunkel'
    },
    language: {
      label: 'Sprache',
      hint: 'Gilt für die ganze App auf diesem Gerät.'
    },
    amounts: {
      label: 'Beträge',
      hint: 'So siehst du die Gebote und gibst deins ein. Brutto heißt mit 19 % Umsatzsteuer.',
      netto: 'Netto',
      brutto: 'Brutto'
    }
  },
  amounts: {
    netto: 'netto',
    brutto: 'brutto',
    toggle: 'Beträge {mode}, auf {other} umschalten'
  },
  progress: {
    of: 'von {amount}',
    perMonth: 'pro Monat',
    covered: 'Gedeckter Anteil des Bedarfs',
    full: 'Bedarf gedeckt: {percent} %',
    percent: '{percent} % gedeckt',
    note: {
      netto: ' netto',
      brutto: ' brutto'
    }
  },
  pin: {
    label: 'PIN',
    submit: 'Anmelden',
    empty: 'Gib deine PIN ein.',
    tooShort: 'Die PIN hat mindestens 4 Ziffern.',
    format: 'Die PIN muss aus 4 bis 8 Ziffern bestehen.',
    mismatch: 'Die beiden PINs stimmen nicht überein.',
    new: 'Neue PIN (4 bis 8 Ziffern)',
    repeat: 'Neue PIN wiederholen',
    save: 'PIN speichern'
  },
  keypad: {
    back: 'Letzte Ziffer löschen',
    decimal: 'Komma'
  },
  front: {
    chooseName: 'Wähle deinen Namen',
    empty: 'Noch niemand ist eingetragen. Die Admins tragen alle ein, die mitbieten.',
    search: 'Name suchen',
    noMatch: 'Kein Name passt zu „{query}“.',
    pinIntro: 'Gib deine PIN ein, um dein Gebot abzugeben.',
    otherName: 'Anderer Name',
    pinForgotten: 'PIN vergessen? Ein Admin kann dir eine neue setzen.'
  },
  member: {
    title: 'Dein Beitrag',
    bidLabel: 'Beitrag:',
    hoursLabel: 'Stunden pro Monat:',
    changeBid: 'Beitrag ändern',
    changeHours: 'Stunden ändern',
    changePin: 'PIN ändern',
    newPin: 'Neue PIN',
    savedBid: 'Dein Beitrag ist jetzt {amount} €.',
    savedHours: 'Dein Stundenbeitrag ist jetzt {hours} h.',
    withdrawn: 'Dein Beitrag ist zurückgezogen.',
    reloadBid: 'Dein Beitrag wird neu geladen, bitte prüfe ihn.',
    reloadHours: 'Dein Stundenbeitrag wird neu geladen, bitte prüfe ihn.',
    pinChanged: 'Deine neue PIN gilt ab sofort.'
  },
  sheet: {
    close: 'Schließen, ohne zu speichern',
    money: {
      title: 'Dein Beitrag',
      label: 'Dein Beitrag in Euro'
    },
    hours: {
      title: 'Dein Stundenbeitrag',
      label: 'Deine Stunden pro Monat'
    }
  },
  admin: {
    title: 'Admin',
    loginIntro: 'Melde dich mit der Admin-PIN an.',
    toStart: 'Zur Startseite',
    pin: {
      title: 'Admin-PIN',
      change: 'Admin-PIN ändern',
      saved: 'Die neue Admin-PIN ist gespeichert.',
      defaultWarning: 'Die Admin-PIN ist noch 0000. Ändere sie, damit niemand sonst Mitglieder, PINs und Gebote verwalten kann.'
    },
    members: {
      title: 'Mitglieder',
      withStartPin: ', {count} davon mit Start-PIN',
      add: 'Mitglied eintragen',
      namePlaceholder: 'Name',
      addButton: 'Eintragen',
      addHint: 'Neue Mitglieder bekommen eine zufällige Start-PIN. Sie wird nach dem Eintragen angezeigt.',
      nameMissing: 'Gib einen Namen ein.',
      checkList: 'Prüfe in der Liste, ob {name} schon eingetragen ist. Wenn ja, tippe auf den Namen und setze eine neue PIN.',
      added: '{name} ist eingetragen. Start-PIN:',
      startPinHint: {
        one: 'Gib die PIN direkt weiter. Sie wird nur jetzt angezeigt. Später kannst du in der Liste eine neue setzen.',
        other: 'Gib die PINs direkt weiter. Sie werden nur jetzt angezeigt. Später kannst du in der Liste neue setzen.'
      },
      search: 'Mitglied suchen',
      noMatch: 'Kein Mitglied passt zu „{query}“.',
      startPin: 'Start-PIN'
    },
    edit: {
      open: 'bearbeiten',
      name: 'Name',
      pin: 'Neue PIN (leer lassen, um sie zu behalten)',
      savedName: '{name} ist gespeichert.',
      savedPin: 'Die neue PIN für {name} ist gespeichert.',
      savedBoth: 'Name und PIN von {name} sind gespeichert.',
      deleteMember: 'Mitglied löschen',
      deleteQuestion: '{name} löschen? Das Gebot wird ebenfalls gelöscht. Das lässt sich hier nicht rückgängig machen.',
      delete: 'Löschen',
      deleted: '{name} ist gelöscht.',
      notDeleted: 'Nicht gelöscht.'
    },
    target: {
      title: 'Bedarf',
      current: 'Aktuell {amount} netto',
      label: 'Neuer Bedarf in Euro (netto)',
      invalid: 'Gib einen Betrag größer als 0 ein, zum Beispiel 6500.',
      saved: 'Der Bedarf ist jetzt {amount} netto.'
    },
    data: {
      title: 'Daten',
      export: 'Exportieren',
      download: 'Herunterladen',
      format: 'Format',
      exportHint: 'Exporte enthalten Namen, Stunden und jedes Gebot netto und brutto, aber keine PINs.',
      exportFailed: 'Export fehlgeschlagen.',
      import: 'Importieren',
      chooseFile: 'Datei auswählen',
      importTypes: 'Erlaubt: CSV, Excel (XLSX) oder JSON aus dem Export. Die Art wird automatisch erkannt.',
      importHint: 'Ein Import ersetzt alle Mitglieder, Gebote und Stunden. Spalten wie im Export: username, pin, contribution (netto), hours.',
      summary: '{members}, Gebote zusammen {total} netto',
      summaryTarget: ', Bedarf {target} netto',
      replaceWarning: 'Der Import ersetzt alle {members}, Gebote und Stunden. Wer schon eingetragen ist, behält die bisherige PIN, wenn die Datei keine PIN enthält. Neue Mitglieder ohne PIN in der Datei bekommen die Start-PIN 1234.',
      importButton: 'Importieren',
      imported: '{members} importiert.',
      notImported: 'Nicht importiert.'
    }
  },
  import: {
    empty: 'Die Datei ist leer.',
    noMembers: 'Die Datei enthält keine Mitglieder.',
    noList: 'Die Datei enthält keine Mitgliederliste.',
    noName: '{at}: Der Name fehlt.',
    badPin: '{at}: Die PIN „{pin}“ muss aus 4 bis 8 Ziffern bestehen.',
    badAmount: '{at}: Der Betrag „{value}“ ist keine gültige Zahl.',
    badGross: '{at}: Der Bruttobetrag „{value}“ ist keine gültige Zahl.',
    badHours: '{at}: Die Stunden „{value}“ sind keine gültige Zahl.',
    badJson: 'Die Datei ist keine gültige JSON-Datei.',
    badXlsx: 'Die Excel-Datei lässt sich nicht lesen. Speichere sie in Excel noch einmal als „Excel-Arbeitsmappe (.xlsx)“.',
    oldExcel: 'Das ist eine alte Excel-Datei (.xls). Speichere sie in Excel als „Excel-Arbeitsmappe (.xlsx)“ oder als CSV.',
    unknown: 'Diese Datei ist weder CSV noch Excel (XLSX) noch JSON.'
  },
  offline: {
    title: 'Keine Verbindung',
    text: 'Der Server antwortet gerade nicht. Prüfe dein Internet und versuche es noch einmal.',
    retry: 'Noch einmal versuchen'
  },
  maintenance: {
    title: 'Gleich wieder da',
    text: 'Die Bietrunde wird gerade kurz gewartet, meist dauert das nur eine Minute. Deine Gebote sind gespeichert.',
    hint: 'Diese Seite prüft alle paar Sekunden von selbst und geht dann weiter.',
    check: 'Jetzt prüfen'
  },
  notFound: {
    title: 'Seite nicht gefunden',
    text: 'Diese Adresse gibt es bei der Bietrunde nicht. Vielleicht ist der Link nicht ganz vollständig.',
    home: 'Zur Bietrunde'
  },
  demo: {
    title: 'Demo mit Beispieldaten.',
    adminPin: 'Admin-PIN:',
    memberPin: 'PIN für alle Namen:',
    toMembers: 'Zur Mitgliederansicht',
    toAdmin: 'Zur Admin-Ansicht',
    reset: 'Demo zurücksetzen'
  },
  // The server's error codes (backend/server.js). {where}: "Zeile 3: " in an import file.
  errors: {
    timeout: 'Der Server antwortet gerade nicht. Versuche es gleich noch einmal.',
    offline: 'Keine Verbindung zum Server. Prüfe dein Internet und versuche es noch einmal.',
    maintenance: 'Die Bietrunde wird gerade kurz gewartet. Versuche es in einer Minute noch einmal.',
    status: 'Serverfehler ({status}). Bitte versuche es noch einmal.',
    session_expired: 'Bitte melde dich neu an.',
    wrong_pin: {
      one: 'PIN falsch. Noch 1 Versuch, dann wird die Anmeldung kurz gesperrt.',
      other: 'PIN falsch. Noch {count} Versuche, dann wird die Anmeldung kurz gesperrt.'
    },
    wrong_pin_locked: 'PIN falsch. Zu viele Fehlversuche. Versuche es in {wait} wieder.',
    device_locked: 'Zu viele Fehlversuche. Versuche es in {wait} wieder.',
    account_locked: 'Für dieses Konto gab es zu viele Fehlversuche. Auf neuen Geräten geht die Anmeldung erst in {wait} wieder. Melde dich auf einem Gerät an, auf dem du schon einmal angemeldet warst, oder lass dir von einem Admin eine neue PIN setzen.',
    account_locked_admin: 'Für das Admin-Konto gab es zu viele Fehlversuche. Auf neuen Geräten geht die Anmeldung erst in {wait} wieder. Melde dich auf einem Gerät an, auf dem du schon einmal als Admin angemeldet warst.',
    login_busy: 'Gerade melden sich sehr viele gleichzeitig an. Versuche es in ein paar Sekunden noch einmal.',
    login_pending: 'Die letzte Anmeldung wird noch geprüft. Versuche es gleich noch einmal.',
    name_gone: 'Diesen Namen gibt es nicht mehr. Lade die Seite neu.',
    too_many_writes: 'Zu viele Änderungen auf einmal. Warte einen Moment.',
    aborted: 'Abgebrochen.',
    bad_request: 'Ungültige Anfrage.',
    unknown_route: 'Unbekannte Adresse.',
    file_too_large: 'Die Datei ist zu groß.',
    server_error: 'Serverfehler. Bitte versuche es noch einmal.',
    pin_format: '{where}Die PIN muss aus 4 bis 8 Ziffern bestehen.',
    name_format: '{where}Bitte gib einen Namen mit höchstens {max} Zeichen ein.',
    hours_range: '{where}Die Stunden müssen zwischen 0 und {max} liegen.',
    amount_range: '{where}{field} muss eine Zahl zwischen 0 und {max} sein.',
    name_taken: '„{name}“ ist schon eingetragen.',
    admin_not_deletable: 'Das Admin-Konto kann nicht gelöscht werden.',
    admin_not_editable: 'Das Admin-Konto lässt sich hier nicht ändern.',
    member_deleted: 'Dieses Mitglied ist schon gelöscht.',
    member_gone: 'Dieses Mitglied gibt es nicht mehr.',
    target_positive: 'Der Bedarf muss größer als 0 sein.',
    import_no_list: 'Die Datei enthält keine Mitgliederliste.',
    import_too_many: 'Die Datei enthält mehr als {max} Einträge.',
    import_duplicate: '„{name}“ steht doppelt in der Datei ({first} und {second}).',
    demo_wrong_pin: 'PIN falsch. In der Demo ist die Admin-PIN {pin}.',
    demo_wrong_pin_member: 'PIN falsch. In der Demo ist die PIN {pin}, wenn du keine eigene gesetzt hast.',
    demo_no_export: 'Exporte sind in der Demo ausgeschaltet. In der echten App bekommst du hier eine Datei mit allen Geboten, netto und brutto.'
  }
};

export default de;
