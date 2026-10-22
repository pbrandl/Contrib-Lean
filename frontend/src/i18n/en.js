// English. Same keys as de.js.
const en = {
  app: {
    name: 'Pledge round',
    title: 'Pledge round · FRANZ!werk Tübingen'
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    done: 'Done',
    logout: 'Log out',
    loading: 'Loading',
    clearSearch: 'Clear search',
    notSaved: 'Not saved.'
  },
  busy: {
    checking: 'Checking',
    saving: 'Saving',
    adding: 'Adding',
    deleting: 'Deleting',
    importing: 'Importing',
    exporting: 'Creating the file'
  },
  count: {
    bids: { one: '1 pledge', other: '{n} pledges' },
    members: { one: '1 member', other: '{count} members' }
  },
  time: {
    minute: 'a minute',
    minutes: { one: 'a minute', other: '{count} minutes' },
    hours: { one: 'an hour', other: '{count} hours' }
  },
  where: {
    line: 'Row {n}',
    entry: 'Entry {n}'
  },
  fields: {
    bid: 'The pledge',
    amount: 'The amount',
    gross: 'The gross amount',
    target: 'The target',
    hours: 'The hours'
  },
  settings: {
    title: 'Settings',
    open: 'Settings',
    close: 'Close settings',
    version: 'Pledge round {version}',
    theme: {
      label: 'Appearance',
      hint: 'Light, dark or Auto: the same as your device.',
      system: 'Auto',
      light: 'Light',
      dark: 'Dark'
    },
    language: {
      label: 'Language',
      hint: 'Applies to the whole app on this device.'
    },
    amounts: {
      label: 'Amounts',
      hint: 'How you see the pledges and enter yours. Gross means including 19 % VAT.',
      netto: 'Net',
      brutto: 'Gross'
    }
  },
  amounts: {
    netto: 'net',
    brutto: 'gross',
    toggle: 'Amounts {mode}, switch to {other}'
  },
  progress: {
    of: 'of {amount}',
    perMonth: 'per month',
    covered: 'Share of the target covered',
    full: 'Target reached: {percent} %',
    percent: '{percent} % covered',
    note: {
      netto: ' net',
      brutto: ' gross'
    }
  },
  pin: {
    label: 'PIN',
    submit: 'Log in',
    empty: 'Enter your PIN.',
    tooShort: 'The PIN has at least 4 digits.',
    format: 'The PIN must have 4 to 8 digits.',
    mismatch: 'The two PINs do not match.',
    new: 'New PIN (4 to 8 digits)',
    repeat: 'Repeat the new PIN',
    save: 'Save PIN'
  },
  keypad: {
    back: 'Delete the last digit',
    decimal: 'Decimal point'
  },
  front: {
    chooseName: 'Choose your name',
    empty: 'Nobody has been added yet. The admins add everybody who takes part.',
    search: 'Search name',
    noMatch: 'No name matches “{query}”.',
    pinIntro: 'Enter your PIN to make your pledge.',
    otherName: 'Other name',
    pinForgotten: 'Forgot your PIN? An admin can set a new one for you.'
  },
  member: {
    title: 'Your pledge',
    bidLabel: 'Pledge:',
    hoursLabel: 'Hours per month:',
    changeBid: 'Change pledge',
    changeHours: 'Change hours',
    changePin: 'Change PIN',
    newPin: 'New PIN',
    savedBid: 'Your pledge is now {amount} €.',
    savedHours: 'Your hours are now {hours} h.',
    withdrawn: 'Your pledge has been withdrawn.',
    reloadBid: 'Your pledge is being reloaded, please check it.',
    reloadHours: 'Your hours are being reloaded, please check them.',
    pinChanged: 'Your new PIN works from now on.'
  },
  sheet: {
    close: 'Close without saving',
    money: {
      title: 'Your pledge',
      label: 'Your pledge in euros'
    },
    hours: {
      title: 'Your hours',
      label: 'Your hours per month'
    }
  },
  admin: {
    title: 'Admin',
    loginIntro: 'Log in with the admin PIN.',
    toStart: 'Back to the start page',
    pin: {
      title: 'Admin PIN',
      change: 'Change admin PIN',
      saved: 'The new admin PIN has been saved.',
      defaultWarning: 'The admin PIN is still 0000. Change it, so that nobody else can manage members, PINs and pledges.'
    },
    members: {
      title: 'Members',
      withStartPin: ', {count} of them with a start PIN',
      add: 'Add member',
      namePlaceholder: 'Name',
      addButton: 'Add',
      addHint: 'New members get a random start PIN. It is shown after adding them.',
      nameMissing: 'Enter a name.',
      checkList: 'Check in the list whether {name} has been added. If so, tap the name and set a new PIN.',
      added: '{name} has been added. Start PIN:',
      startPinHint: {
        one: 'Pass the PIN on right away. It is only shown now. Later you can set a new one in the list.',
        other: 'Pass the PINs on right away. They are only shown now. Later you can set new ones in the list.'
      },
      search: 'Search member',
      noMatch: 'No member matches “{query}”.',
      startPin: 'Start PIN'
    },
    edit: {
      open: 'edit',
      name: 'Name',
      pin: 'New PIN (leave empty to keep it)',
      savedName: '{name} has been saved.',
      savedPin: 'The new PIN for {name} has been saved.',
      savedBoth: 'Name and PIN of {name} have been saved.',
      deleteMember: 'Delete member',
      deleteQuestion: 'Delete {name}? Their pledge is deleted too. This cannot be undone here.',
      delete: 'Delete',
      deleted: '{name} has been deleted.',
      notDeleted: 'Not deleted.'
    },
    target: {
      title: 'Target',
      current: 'Currently {amount} net',
      label: 'New target in euros (net)',
      invalid: 'Enter an amount greater than 0, for example 6500.',
      saved: 'The target is now {amount} net.'
    },
    data: {
      title: 'Data',
      export: 'Export',
      download: 'Download',
      format: 'Format',
      exportHint: 'Exports contain names, hours and every pledge net and gross, but no PINs.',
      exportFailed: 'Export failed.',
      import: 'Import',
      chooseFile: 'Choose file',
      importTypes: 'Allowed: CSV, Excel (XLSX) or JSON from the export. The type is detected automatically.',
      importHint: 'An import replaces all members, pledges and hours. Columns as in the export: username, pin, contribution (net), hours.',
      summary: '{members}, pledges together {total} net',
      summaryTarget: ', target {target} net',
      replaceWarning: 'The import replaces all {members}, pledges and hours. Members who are already there keep their PIN if the file has none. New members without a PIN in the file get the start PIN 1234.',
      importButton: 'Import',
      imported: '{members} imported.',
      notImported: 'Not imported.'
    }
  },
  import: {
    empty: 'The file is empty.',
    noMembers: 'The file contains no members.',
    noList: 'The file contains no member list.',
    noName: '{at}: the name is missing.',
    badPin: '{at}: the PIN “{pin}” must have 4 to 8 digits.',
    badAmount: '{at}: the amount “{value}” is not a valid number.',
    badGross: '{at}: the gross amount “{value}” is not a valid number.',
    badHours: '{at}: the hours “{value}” are not a valid number.',
    badJson: 'The file is not a valid JSON file.',
    badXlsx: 'The Excel file cannot be read. Save it again in Excel as “Excel Workbook (.xlsx)”.',
    oldExcel: 'This is an old Excel file (.xls). Save it in Excel as “Excel Workbook (.xlsx)” or as CSV.',
    unknown: 'This file is neither CSV nor Excel (XLSX) nor JSON.'
  },
  offline: {
    title: 'No connection',
    text: 'The server is not answering right now. Check your internet connection and try again.',
    retry: 'Try again'
  },
  maintenance: {
    title: 'Back in a moment',
    text: 'The pledge round is being updated, this usually takes just a minute. Your pledges are saved.',
    hint: 'This page checks every few seconds and continues on its own.',
    check: 'Check now'
  },
  notFound: {
    title: 'Page not found',
    text: 'This address does not exist in the pledge round. Maybe the link is incomplete.',
    home: 'Go to the pledge round'
  },
  demo: {
    title: 'Demo with example data.',
    adminPin: 'Admin PIN:',
    memberPin: 'PIN for all names:',
    toMembers: 'Member view',
    toAdmin: 'Admin view',
    reset: 'Reset demo'
  },
  errors: {
    timeout: 'The server is not answering right now. Try again in a moment.',
    offline: 'No connection to the server. Check your internet connection and try again.',
    maintenance: 'The pledge round is being updated. Try again in a minute.',
    status: 'Server error ({status}). Please try again.',
    session_expired: 'Please log in again.',
    wrong_pin: {
      one: 'Wrong PIN. 1 more try, then logging in is locked for a short while.',
      other: 'Wrong PIN. {count} more tries, then logging in is locked for a short while.'
    },
    wrong_pin_locked: 'Wrong PIN. Too many failed attempts. Try again in {wait}.',
    device_locked: 'Too many failed attempts. Try again in {wait}.',
    account_locked: 'There were too many failed attempts for this account. On new devices you can log in again in {wait}. Log in on a device you have used before, or ask an admin to set a new PIN.',
    account_locked_admin: 'There were too many failed attempts for the admin account. On new devices you can log in again in {wait}. Log in on a device where you have been logged in as admin before.',
    login_busy: 'Very many people are logging in right now. Try again in a few seconds.',
    login_pending: 'The last login is still being checked. Try again in a moment.',
    name_gone: 'This name no longer exists. Reload the page.',
    too_many_writes: 'Too many changes at once. Wait a moment.',
    aborted: 'Cancelled.',
    bad_request: 'Invalid request.',
    unknown_route: 'Unknown address.',
    file_too_large: 'The file is too large.',
    server_error: 'Server error. Please try again.',
    pin_format: '{where}The PIN must have 4 to 8 digits.',
    name_format: '{where}Please enter a name with at most {max} characters.',
    hours_range: '{where}The hours must be between 0 and {max}.',
    amount_range: '{where}{field} must be a number between 0 and {max}.',
    name_taken: '“{name}” has already been added.',
    admin_not_deletable: 'The admin account cannot be deleted.',
    admin_not_editable: 'The admin account cannot be changed here.',
    member_deleted: 'This member has already been deleted.',
    member_gone: 'This member no longer exists.',
    target_positive: 'The target must be greater than 0.',
    import_no_list: 'The file contains no member list.',
    import_too_many: 'The file contains more than {max} entries.',
    import_duplicate: '“{name}” appears twice in the file ({first} and {second}).',
    demo_wrong_pin: 'Wrong PIN. In the demo the admin PIN is {pin}.',
    demo_wrong_pin_member: 'Wrong PIN. In the demo the PIN is {pin}, unless you have set your own.',
    demo_no_export: 'Exports are switched off in the demo. In the real app you get a file with all pledges here, net and gross.'
  }
};

export default en;
