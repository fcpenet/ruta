import type { PlaceLabel, VehicleType } from '@/types';

import type { Messages, Rich } from './en';

const sa = (p: PlaceLabel) =>
  p ? (p.near ? `malapit sa ${p.name}` : `sa ${p.name}`) : 'sa naka-pin na lugar';
const papunta = (p: PlaceLabel) =>
  p ? (p.near ? `papunta malapit sa ${p.name}` : `papunta sa ${p.name}`) : 'papunta sa naka-pin na lugar';
const vehicles: Record<VehicleType, string> = {
  jeep: 'jeep',
  modern_jeep: 'modern jeep',
  tricycle: 'tricycle',
};

/** Filipino UI text. Typed against English, so a missing or misshapen entry won't compile. */
export const fil: Messages = {
  common: {
    noConnection: 'Walang koneksyon. Tingnan ang internet mo at subukan ulit.',
    somethingWrong: 'Nagkaproblema. Pakisubukan ulit.',
    tooMany: 'Masyadong maraming subok. Maghintay muna sandali at subukan ulit.',
    cancel: 'Kanselahin',
    duration: (minutes: number) => {
      const m = Math.max(1, Math.round(minutes));
      return m >= 60 ? `${Math.floor(m / 60)} oras ${m % 60} min` : `${m} min`;
    },
  },

  language: {
    label: 'Wika',
  },

  nav: {
    commute: 'Biyahe',
    routes: 'Mga Ruta',
    fares: 'Pamasahe',
    addRoute: 'Magdagdag ng ruta',
    account: 'Account',
  },

  place: {
    at: sa,
    to: papunta,
    name: (p: PlaceLabel) => (p ? (p.near ? `Malapit sa ${p.name}` : p.name) : 'Naka-pin na lugar'),
    myLocation: 'Lokasyon mo',
  },

  search: {
    from: 'Mula',
    to: 'Papunta',
    fromPlaceholder: 'Saan ka manggagaling?',
    toPlaceholder: 'Saan ka pupunta?',
    swap: 'Pagpalitin ang pinanggalingan at pupuntahan',
    useMyLocation: '◎ Gamitin ang lokasyon ko',
    noMatch: 'Walang tugma. Pindutin nang matagal ang mapa para mag-pin.',
    locationDenied: 'Hindi pinayagan ang lokasyon. Pindutin na lang nang matagal ang mapa.',
    locationFailed: 'Hindi makuha ang lokasyon mo.',
    tip: (origin: boolean) =>
      `Tip: pindutin nang matagal (o i-right-click) ang mapa para itakda ${origin ? 'kung saan ka manggagaling' : 'kung saan ka pupunta'}.`,
    sheetTitle: 'Ruta: gabay sa jeep at tricycle',
  },

  traffic: {
    levels: { free: 'Maluwag', moderate: 'Katamtaman', heavy: 'Traffic', standstill: 'Hinto' },
    onRide: {
      free: 'maluwag',
      moderate: 'medyo traffic',
      heavy: 'traffic',
      standstill: 'sobrang traffic',
    },
    demo: '(demo data)',
    at: 'Traffic sa:',
    live: 'Ngayon',
    noon: '12 NN',
  },

  trip: {
    prompt:
      'Ilagay kung saan ka manggagaling at saan ka pupunta para makita kung anong jeep o tricycle ang sasakyan.',
    noneTitle: 'Walang nakitang ruta.',
    noneBody:
      'Wala pang ruta o lakaran sa data namin na nagdudugtong sa mga lugar na ito. Subukan ang malapit na landmark, o idagdag ang jeep o lakaran na alam mo sa tab na Mga Ruta.',
    walkOnly: 'Lakad lang',
    transfers: (n: number) => `${n} lipat`,
    walk: (distance: string, dest: PlaceLabel, via?: string): Rich => [
      `Maglakad nang ${distance}`,
      ...(via ? [' sa ', { b: via }] : []),
      ` ${papunta(dest)}`,
    ],
    board: (vehicle: VehicleType, place: PlaceLabel): Rich => [
      `Sumakay ng ${vehicles[vehicle]} `,
      { b: sa(place) },
    ],
    signboard: (text: string) => `Hanapin ang karatula: “${text}”`,
    alight: (place: PlaceLabel): Rich => ['Bumaba ', { b: sa(place) }, ': “Para po!”'],
    unverifiedRide:
      '⚠ Idinagdag ng isang commuter, hindi pa kumpirmado. Itanong muna sa barker o sa driver.',
    unverifiedWalk: '⚠ Lakarang idinagdag ng isang commuter, hindi pa kumpirmado.',
  },

  vehicles,

  routes: {
    title: 'Mga Ruta',
    add: '+ Magdagdag',
    dataInfo: (region: string, version: number, updated: string) =>
      `${region} · data v${version}, na-update noong ${updated}`,
    loadError: 'Hindi ma-load ang mga ruta ng community. Pindutin para subukan ulit.',
    searchPlaceholder: 'Hanapin: Cubao, Quiapo, UP Ikot…',
    filters: {
      all: 'Lahat',
      jeep: 'Jeep',
      modern_jeep: 'Modern jeep',
      tricycle: 'Tricycle',
      walk: 'Lakaran',
      community: 'Community',
    },
    types: {
      jeep: 'Jeep',
      modern_jeep: 'Modern jeep',
      tricycle: 'Tricycle',
      walk: 'Lakaran',
    },
    empty: 'Walang tugma. Subukan ang ibang pangalan o filter.',
    signboard: (text: string) => `Karatula: “${text}”`,
    oneWay: 'isang direksyon',
    bothWays: 'balikan',
    added: (date: string, author?: string) =>
      `idinagdag noong ${date}${author ? ` ni @${author}` : ''}`,
    checked: (date: string) => `sinuri noong ${date}`,
    showOnMap: 'Ipakita sa mapa →',
    showOnMapHint: 'Ipinapakita ang rutang ito sa mapa',
    account: {
      loggedInAs: (username: string) => `Naka-log in bilang @${username}`,
      logOut: 'Mag-log out',
      prompt: 'Mag-log in para magdagdag o mag-kumpirma ng ruta.',
      logIn: 'Mag-log in / Mag-sign up',
    },
    badges: {
      verified: '✓ Kumpirmado ng mga commuter',
      unverified: '⚠ Hindi pa kumpirmado · idinagdag ng commuter',
      disputed: '✕ Kinukuwestiyon · inireport ng mga commuter',
    },
    counts: (confirmed: number, reported: number) =>
      `${confirmed} kumpirmado · ${reported} report`,
    thanksConfirm: 'Salamat sa pag-kumpirma!',
    thanksReport: (reason: string) => `Salamat! Inireport mo: ${reason}.`,
    youAdded: 'Ikaw ang nagdagdag nito',
    confirm: 'Nasakyan ko ’to ✓',
    confirmHint: 'Kumpirmahin na nasakyan mo na ang rutang ito',
    report: 'Mali ’to',
    changeReport: 'Palitan ang report',
    reportHint: 'I-report na mali, wala na, o peke ang rutang ito',
    whatsWrong: 'Ano ang mali?',
    reasons: {
      wrong_path: 'Maling daan',
      not_running: 'Wala na',
      spam: 'Spam / peke',
    },
    voteFailed: 'Hindi naipadala. Subukan ulit.',
  },

  addRoute: {
    notSetUp: 'Hindi pa naka-set up ang mga ruta ng community.',
    notSetUpBody:
      'I-set ang EXPO_PUBLIC_API_URL sa Ruta API (server/) para makapagdagdag ng ruta ang mga commuter.',
    logInToAdd: 'Mag-log in para magdagdag ng ruta.',
    logIn: 'Mag-log in / Mag-sign up',
    instructionsRide: (click: boolean) =>
      `${click ? 'I-click' : 'Pindutin'} ang kalsada sa unang terminal, sa bawat liko ng jeep, at sa huling terminal. Susundan ng linya ang mga kalye; kapag mali ang liko, i-undo at ${click ? 'i-click' : 'pindutin'} ang tamang kalsada.`,
    instructionsWalk: (click: boolean) =>
      `${click ? 'I-click' : 'Pindutin'} kung saan nagsisimula at natatapos ang lakad, malapit sa mga linya ng jeep na dinudugtong nito, pati ang mga liko. Susundan ng linya ang mga daanan; gamitin ang tuwid na linya para sa daanang wala sa mapa (mall, footbridge).`,
    bigGap: 'May dalawang punto na lampas 5 km ang layo. Magdagdag ng punto sa pagitan, sa kahabaan ng kalsada.',
    tooLong: (max: number) =>
      `Hanggang ${max} km lang ang lakaran. Hatiin ang mas mahabang lakad, o idagdag ito bilang ruta ng jeep o tricycle.`,
    type: 'Uri',
    signboard: 'Karatula',
    signboardPlaceholder: 'hal. CUBAO – QUIAPO',
    from: 'Mula',
    to: 'Hanggang',
    endPlaceholder: 'Pindutin ang mapa, o i-type',
    via: 'Daan (opsyonal)',
    viaPlaceholder: 'hal. Aurora Blvd',
    viaWalk: 'Daanan (opsyonal)',
    viaWalkPlaceholder: 'hal. footbridge, walkway ng SM Cubao',
    city: 'Lungsod (para sa pamasahe)',
    otherCity: 'Iba',
    direction: 'Direksyon',
    directions: { both: 'Balikan', oneway: 'Isang direksyon lang' },
    onewayHint: 'Iguhit ang mga punto ayon sa direksyon ng biyahe.',
    hours: 'Oras ng biyahe (opsyonal)',
    hoursPlaceholder: 'hal. 5:00 AM – 10:00 PM',
    missing: (items: string[]) => `Kailangan pa: ${items.join(', ')}.`,
    missingItems: {
      points: 'hindi bababa sa 2 punto sa mapa',
      signboard: 'ang karatula',
      from: 'kung saan nagsisimula',
      to: 'kung saan natatapos',
    },
    submitRide: 'I-submit ang ruta',
    submitWalk: 'I-submit ang lakaran',
    footnote:
      'Lalabas na “hindi pa kumpirmado” ang bagong ruta hangga’t hindi ito kinukumpirma ng ibang commuter. Hindi na imumungkahi sa biyahe ang rutang mas maraming report kaysa kumpirmasyon.',
    undo: '↶ Undo',
    clear: 'Burahin',
    followRoads: '✓ Sundan ang kalsada',
    followPaths: '✓ Sundan ang daanan',
    straight: 'Tuwid na linya',
    stats: (points: number, km: number) => `${points} punto · ${km.toFixed(1)} km`,
    snap: {
      loading: 'Sinusundan ang kalsada…',
      noRoad: 'Walang kalsadang nagdudugtong dito: tuwid na linya muna.',
      unavailable: 'Hindi magamit ngayon ang pagsunod sa kalsada: tuwid na linya muna.',
    },
  },

  auth: {
    signUpTitle: 'Gumawa ng account',
    logInTitle: 'Mag-log in',
    introAddRoute:
      'Mag-log in para magdagdag ng ruta. Makikita ng ibang commuter ang username mo rito.',
    intro: 'Mag-log in para magdagdag ng ruta at mag-kumpirma ng mga nasakyan mo.',
    username: 'Username',
    usernamePlaceholder: 'hal. juan_commuter',
    password: 'Password',
    passwordPlaceholder: (min: number) => `Hindi bababa sa ${min} character`,
    usernameRule: '3–20 letra, numero, _ o .',
    signUp: 'Mag-sign up',
    logIn: 'Mag-log in',
    toLogIn: 'May account na? Mag-log in',
    toSignUp: 'Wala pang account? Mag-sign up',
    wrongCredentials: 'Mali ang username o password.',
    usernameTaken: 'May gumagamit na ng username na iyan.',
  },

  fares: {
    title: 'Pamasahe',
    discounts: {
      regular: 'Regular',
      student: 'Estudyante',
      senior: 'Senior',
      pwd: 'PWD',
    },
    discountNote: 'May 20% diskwento ang estudyante, senior citizen at PWD. Ipakita ang ID.',
    calculator: 'Calculator ng pamasahe',
    distanceLabel: 'Layo sa kilometro',
    enterDistance: 'Ilagay ang layo sa km.',
    tricycleQc: 'Tricycle (QC)',
    matrixTitle: 'Fare matrix ng jeep',
    jeepRule: (base: number, baseKm: number, perKm: string) =>
      `₱${base} sa unang ${baseKm} km, tapos +₱${perKm} bawat km`,
    tricycleTitle: 'Tricycle',
    columns: { km: 'km', city: 'Lungsod', base: 'Simula', perKm: 'Bawat km', special: 'Special' },
    cities: {
      quezon_city: 'Quezon City',
      manila: 'Maynila',
      default: 'Ibang LGU (tantya)',
    },
    effective: (date: string) => `Epektibo mula ${date}.`,
  },
};
