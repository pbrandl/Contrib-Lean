// Spanish. Same keys as de.js.
const es = {
  app: {
    name: 'Ronda de ofertas',
    title: 'Ronda de ofertas · FRANZ!werk Tübingen'
  },
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    done: 'Listo',
    logout: 'Cerrar sesión',
    loading: 'Cargando',
    clearSearch: 'Borrar búsqueda',
    notSaved: 'No se ha guardado.'
  },
  busy: {
    checking: 'Comprobando',
    saving: 'Guardando',
    adding: 'Añadiendo',
    deleting: 'Eliminando',
    importing: 'Importando',
    exporting: 'Creando el archivo'
  },
  count: {
    bids: { one: '1 oferta', other: '{n} ofertas' },
    members: { one: '1 miembro', other: '{count} miembros' }
  },
  time: {
    minute: 'un minuto',
    minutes: { one: 'un minuto', other: '{count} minutos' },
    hours: { one: 'una hora', other: '{count} horas' }
  },
  where: {
    line: 'Fila {n}',
    entry: 'Entrada {n}'
  },
  fields: {
    bid: 'La aportación',
    amount: 'El importe',
    gross: 'El importe bruto',
    target: 'La necesidad',
    hours: 'Las horas'
  },
  settings: {
    title: 'Ajustes',
    open: 'Ajustes',
    close: 'Cerrar ajustes',
    version: 'Ronda de ofertas {version}',
    theme: {
      label: 'Apariencia',
      hint: 'Clara, oscura o Auto: como esté configurado tu dispositivo.',
      system: 'Auto',
      light: 'Clara',
      dark: 'Oscura'
    },
    language: {
      label: 'Idioma',
      hint: 'Se aplica a toda la app en este dispositivo.'
    },
    amounts: {
      label: 'Importes',
      hint: 'Así ves las ofertas e introduces la tuya. Bruto significa con 19 % de IVA.',
      netto: 'Neto',
      brutto: 'Bruto'
    }
  },
  amounts: {
    netto: 'neto',
    brutto: 'bruto',
    toggle: 'Importes en {mode}, cambiar a {other}'
  },
  progress: {
    of: 'de {amount}',
    perMonth: 'al mes',
    covered: 'Parte cubierta de la necesidad',
    full: 'Necesidad cubierta: {percent} %',
    percent: '{percent} % cubierto',
    note: {
      netto: ' neto',
      brutto: ' bruto'
    }
  },
  pin: {
    label: 'PIN',
    submit: 'Entrar',
    empty: 'Introduce tu PIN.',
    tooShort: 'El PIN tiene al menos 4 cifras.',
    format: 'El PIN debe tener entre 4 y 8 cifras.',
    mismatch: 'Los dos PIN no coinciden.',
    new: 'PIN nuevo (4 a 8 cifras)',
    repeat: 'Repite el PIN nuevo',
    save: 'Guardar PIN'
  },
  keypad: {
    back: 'Borrar la última cifra',
    decimal: 'Coma'
  },
  front: {
    chooseName: 'Elige tu nombre',
    empty: 'Todavía no hay nadie. Los administradores añaden a todas las personas que participan.',
    search: 'Buscar nombre',
    noMatch: 'Ningún nombre coincide con «{query}».',
    pinIntro: 'Introduce tu PIN para hacer tu oferta.',
    otherName: 'Otro nombre',
    pinForgotten: '¿Olvidaste tu PIN? Un administrador puede ponerte uno nuevo.'
  },
  member: {
    title: 'Tu aportación',
    bidLabel: 'Aportación:',
    hoursLabel: 'Horas al mes:',
    changeBid: 'Cambiar aportación',
    changeHours: 'Cambiar horas',
    changePin: 'Cambiar PIN',
    newPin: 'PIN nuevo',
    savedBid: 'Tu aportación es ahora {amount} €.',
    savedHours: 'Tus horas son ahora {hours} h.',
    withdrawn: 'Tu aportación se ha retirado.',
    reloadBid: 'Se está recargando tu aportación, compruébala.',
    reloadHours: 'Se están recargando tus horas, compruébalas.',
    pinChanged: 'Tu nuevo PIN vale desde ahora.'
  },
  sheet: {
    close: 'Cerrar sin guardar',
    money: {
      title: 'Tu aportación',
      label: 'Tu aportación en euros'
    },
    hours: {
      title: 'Tus horas',
      label: 'Tus horas al mes'
    }
  },
  admin: {
    title: 'Administración',
    loginIntro: 'Entra con el PIN de administración.',
    toStart: 'Volver al inicio',
    pin: {
      title: 'PIN de administración',
      change: 'Cambiar PIN de administración',
      saved: 'El nuevo PIN de administración se ha guardado.',
      defaultWarning: 'El PIN de administración sigue siendo 0000. Cámbialo para que nadie más pueda gestionar miembros, PIN y ofertas.'
    },
    members: {
      title: 'Miembros',
      withStartPin: ', {count} con PIN inicial',
      add: 'Añadir miembro',
      namePlaceholder: 'Nombre',
      addButton: 'Añadir',
      addHint: 'Los miembros nuevos reciben un PIN inicial aleatorio. Se muestra después de añadirlos.',
      nameMissing: 'Introduce un nombre.',
      checkList: 'Comprueba en la lista si {name} ya está. Si es así, toca el nombre y pon un PIN nuevo.',
      added: '{name} se ha añadido. PIN inicial:',
      startPinHint: {
        one: 'Comunica el PIN enseguida. Solo se muestra ahora. Más tarde puedes poner uno nuevo en la lista.',
        other: 'Comunica los PIN enseguida. Solo se muestran ahora. Más tarde puedes poner otros nuevos en la lista.'
      },
      search: 'Buscar miembro',
      noMatch: 'Ningún miembro coincide con «{query}».',
      startPin: 'PIN inicial'
    },
    edit: {
      open: 'editar',
      name: 'Nombre',
      pin: 'PIN nuevo (déjalo vacío para mantenerlo)',
      savedName: '{name} se ha guardado.',
      savedPin: 'El PIN nuevo de {name} se ha guardado.',
      savedBoth: 'El nombre y el PIN de {name} se han guardado.',
      deleteMember: 'Eliminar miembro',
      deleteQuestion: '¿Eliminar a {name}? Su oferta también se elimina. Aquí no se puede deshacer.',
      delete: 'Eliminar',
      deleted: '{name} se ha eliminado.',
      notDeleted: 'No se ha eliminado.'
    },
    target: {
      title: 'Necesidad',
      current: 'Ahora {amount} neto',
      label: 'Nueva necesidad en euros (neto)',
      invalid: 'Introduce un importe mayor que 0, por ejemplo 6500.',
      saved: 'La necesidad es ahora {amount} neto.'
    },
    data: {
      title: 'Datos',
      export: 'Exportar',
      download: 'Descargar',
      format: 'Formato',
      exportHint: 'Las exportaciones contienen nombres, horas y cada oferta en neto y bruto, pero ningún PIN.',
      exportFailed: 'La exportación ha fallado.',
      import: 'Importar',
      chooseFile: 'Elegir archivo',
      importTypes: 'Se admiten CSV, Excel (XLSX) o JSON de la exportación. El tipo se detecta automáticamente.',
      importHint: 'Una importación sustituye a todos los miembros, ofertas y horas. Columnas como en la exportación: username, pin, contribution (neto), hours.',
      summary: '{members}, ofertas en total {total} neto',
      summaryTarget: ', necesidad {target} neto',
      replaceWarning: 'La importación sustituye a los {members}, sus ofertas y horas. Quien ya está mantiene su PIN si el archivo no trae ninguno. Los miembros nuevos sin PIN en el archivo reciben el PIN inicial 1234.',
      importButton: 'Importar',
      imported: '{members} importados.',
      notImported: 'No se ha importado.'
    }
  },
  import: {
    empty: 'El archivo está vacío.',
    noMembers: 'El archivo no contiene miembros.',
    noList: 'El archivo no contiene una lista de miembros.',
    noName: '{at}: falta el nombre.',
    badPin: '{at}: el PIN «{pin}» debe tener entre 4 y 8 cifras.',
    badAmount: '{at}: el importe «{value}» no es un número válido.',
    badGross: '{at}: el importe bruto «{value}» no es un número válido.',
    badHours: '{at}: las horas «{value}» no son un número válido.',
    badJson: 'El archivo no es un JSON válido.',
    badXlsx: 'No se puede leer el archivo de Excel. Guárdalo de nuevo en Excel como «Libro de Excel (.xlsx)».',
    oldExcel: 'Es un archivo antiguo de Excel (.xls). Guárdalo en Excel como «Libro de Excel (.xlsx)» o como CSV.',
    unknown: 'Este archivo no es ni CSV ni Excel (XLSX) ni JSON.'
  },
  offline: {
    title: 'Sin conexión',
    text: 'El servidor no responde en este momento. Comprueba tu conexión a internet e inténtalo de nuevo.',
    retry: 'Intentar de nuevo'
  },
  maintenance: {
    title: 'Volvemos enseguida',
    text: 'La ronda de ofertas se está actualizando, normalmente solo tarda un minuto. Tus ofertas están guardadas.',
    hint: 'Esta página lo comprueba cada pocos segundos y continúa sola.',
    check: 'Comprobar ahora'
  },
  notFound: {
    title: 'Página no encontrada',
    text: 'Esta dirección no existe en la ronda de ofertas. Quizá el enlace está incompleto.',
    home: 'Ir a la ronda de ofertas'
  },
  demo: {
    title: 'Demo con datos de ejemplo.',
    adminPin: 'PIN de administración:',
    memberPin: 'PIN para todos los nombres:',
    toMembers: 'Vista de miembros',
    toAdmin: 'Vista de administración',
    reset: 'Reiniciar demo'
  },
  errors: {
    timeout: 'El servidor no responde en este momento. Inténtalo de nuevo enseguida.',
    offline: 'Sin conexión con el servidor. Comprueba tu conexión a internet e inténtalo de nuevo.',
    maintenance: 'La ronda de ofertas se está actualizando. Inténtalo de nuevo en un minuto.',
    status: 'Error del servidor ({status}). Inténtalo de nuevo.',
    session_expired: 'Vuelve a entrar, por favor.',
    wrong_pin: {
      one: 'PIN incorrecto. Te queda 1 intento; después el acceso se bloquea un rato.',
      other: 'PIN incorrecto. Te quedan {count} intentos; después el acceso se bloquea un rato.'
    },
    wrong_pin_locked: 'PIN incorrecto. Demasiados intentos fallidos. Inténtalo de nuevo dentro de {wait}.',
    device_locked: 'Demasiados intentos fallidos. Inténtalo de nuevo dentro de {wait}.',
    account_locked: 'Ha habido demasiados intentos fallidos con esta cuenta. En dispositivos nuevos podrás entrar dentro de {wait}. Entra desde un dispositivo que ya hayas usado o pide a un administrador un PIN nuevo.',
    account_locked_admin: 'Ha habido demasiados intentos fallidos con la cuenta de administración. En dispositivos nuevos podrás entrar dentro de {wait}. Entra desde un dispositivo en el que ya hayas entrado como administrador.',
    login_busy: 'Ahora mismo están entrando muchísimas personas. Inténtalo de nuevo en unos segundos.',
    login_pending: 'Todavía se está comprobando el último acceso. Inténtalo de nuevo enseguida.',
    name_gone: 'Este nombre ya no existe. Vuelve a cargar la página.',
    too_many_writes: 'Demasiados cambios a la vez. Espera un momento.',
    aborted: 'Cancelado.',
    bad_request: 'Solicitud no válida.',
    unknown_route: 'Dirección desconocida.',
    file_too_large: 'El archivo es demasiado grande.',
    server_error: 'Error del servidor. Inténtalo de nuevo.',
    pin_format: '{where}El PIN debe tener entre 4 y 8 cifras.',
    name_format: '{where}Introduce un nombre de como máximo {max} caracteres.',
    hours_range: '{where}Las horas deben estar entre 0 y {max}.',
    amount_range: '{where}{field} debe ser un número entre 0 y {max}.',
    name_taken: '«{name}» ya está en la lista.',
    admin_not_deletable: 'La cuenta de administración no se puede eliminar.',
    admin_not_editable: 'La cuenta de administración no se puede cambiar aquí.',
    member_deleted: 'Este miembro ya se ha eliminado.',
    member_gone: 'Este miembro ya no existe.',
    target_positive: 'La necesidad debe ser mayor que 0.',
    import_no_list: 'El archivo no contiene una lista de miembros.',
    import_too_many: 'El archivo contiene más de {max} entradas.',
    import_duplicate: '«{name}» aparece dos veces en el archivo ({first} y {second}).',
    demo_wrong_pin: 'PIN incorrecto. En la demo, el PIN de administración es {pin}.',
    demo_wrong_pin_member: 'PIN incorrecto. En la demo, el PIN es {pin} si no has puesto uno propio.',
    demo_no_export: 'Las exportaciones están desactivadas en la demo. En la app real aquí obtienes un archivo con todas las ofertas, en neto y bruto.'
  }
};

export default es;
