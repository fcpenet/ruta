import type { DiscountType, PlaceLabel, ReportReason, RouteType, TrafficLevel, VehicleType } from '@/types';

/**
 * A run of text where `{ b }` parts are shown bold. Lets each language order the
 * emphasised words however its grammar needs.
 */
export type Rich = (string | { b: string })[];

const at = (p: PlaceLabel) => (p ? (p.near ? `near ${p.name}` : `at ${p.name}`) : 'at the pin');
const to = (p: PlaceLabel) => (p ? (p.near ? `toward ${p.name}` : `to ${p.name}`) : 'to the pin');
const vehicles: Record<VehicleType, string> = {
  jeep: 'jeep',
  modern_jeep: 'modern jeep',
  tricycle: 'tricycle',
};

/** English UI text. The source of truth for the shape of every other language. */
export const en = {
  common: {
    noConnection: 'No connection. Check your internet and try again.',
    somethingWrong: 'Something went wrong. Please try again.',
    tooMany: 'Too many tries. Please wait a bit and try again.',
    cancel: 'Cancel',
    duration: (minutes: number) => {
      const m = Math.max(1, Math.round(minutes));
      return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
    },
  },

  language: {
    label: 'Language',
  },

  nav: {
    commute: 'Commute',
    routes: 'Routes',
    fares: 'Fares',
    addRoute: 'Add a route',
    account: 'Account',
  },

  place: {
    /** "Get on the jeep {at}". */
    at,
    /** "Walk 300 m {to}". */
    to,
    /** A place on its own, e.g. a dropped pin in the From/To fields. */
    name: (p: PlaceLabel) => (p ? (p.near ? `Near ${p.name}` : p.name) : 'Dropped pin'),
    myLocation: 'Your location',
  },

  search: {
    from: 'From',
    to: 'To',
    fromPlaceholder: 'Where are you coming from?',
    toPlaceholder: 'Where are you going?',
    swap: 'Swap start and destination',
    useMyLocation: '◎ Use my location',
    noMatch: 'No match. Long-press the map to drop a pin.',
    locationDenied: 'Location permission denied. Long-press the map instead.',
    locationFailed: 'Couldn’t get your location.',
    tip: (origin: boolean) =>
      `Tip: long-press (or right-click) the map to set ${origin ? 'where you start' : 'where you’re going'}.`,
    sheetTitle: 'Ruta: jeep and tricycle planner',
  },

  traffic: {
    levels: { free: 'Light', moderate: 'Moderate', heavy: 'Heavy', standstill: 'Standstill' } as Record<
      TrafficLevel,
      string
    >,
    onRide: {
      free: 'light traffic',
      moderate: 'some traffic',
      heavy: 'heavy traffic',
      standstill: 'standstill',
    } as Record<TrafficLevel, string>,
    demo: '(demo data)',
    at: 'Traffic at:',
    live: 'Live',
    noon: '12 PM',
  },

  trip: {
    prompt: 'Set where you’re coming from and where you’re going to see which jeep or tricycle to take.',
    noneTitle: 'No route found.',
    noneBody:
      'No route or walk link in our data connects these points yet. Try a nearby landmark, or add the jeep or walk you know in the Routes tab.',
    walkOnly: 'Walk only',
    transfers: (n: number) => `${n} transfer${n === 1 ? '' : 's'}`,
    walk: (distance: string, dest: PlaceLabel, via?: string): Rich => [
      `Walk ${distance}`,
      ...(via ? [' via ', { b: via }] : []),
      ` ${to(dest)}`,
    ],
    board: (vehicle: VehicleType, place: PlaceLabel): Rich => [
      `Get on the ${vehicles[vehicle]} `,
      { b: at(place) },
    ],
    signboard: (text: string) => `Look for the signboard: “${text}”`,
    alight: (place: PlaceLabel): Rich => ['Get off ', { b: at(place) }, ' and say “Para po!”'],
    unverifiedRide: '⚠ Added by a commuter, not yet confirmed. Double-check with the barker or driver.',
    unverifiedWalk: '⚠ Walk added by a commuter, not yet confirmed.',
  },

  vehicles,

  routes: {
    title: 'Routes',
    add: '+ Add route',
    dataInfo: (region: string, version: number, updated: string) =>
      `${region} · data v${version}, updated ${updated}`,
    loadError: 'Couldn’t load community routes. Tap to retry.',
    searchPlaceholder: 'Search: Cubao, Quiapo, UP Ikot…',
    filters: {
      all: 'All',
      jeep: 'Jeep',
      modern_jeep: 'Modern jeep',
      tricycle: 'Tricycle',
      walk: 'Walk',
      community: 'Community',
    },
    types: {
      jeep: 'Jeep',
      modern_jeep: 'Modern jeep',
      tricycle: 'Tricycle',
      walk: 'Walk link',
    } as Record<RouteType, string>,
    empty: 'Nothing matches. Try another name or filter.',
    signboard: (text: string) => `Signboard: “${text}”`,
    oneWay: 'one way',
    bothWays: 'both ways',
    added: (date: string, author?: string) => `added ${date}${author ? ` by @${author}` : ''}`,
    checked: (date: string) => `checked ${date}`,
    showOnMap: 'Show on map →',
    showOnMapHint: 'Shows this route on the map',
    account: {
      loggedInAs: (username: string) => `Logged in as @${username}`,
      logOut: 'Log out',
      prompt: 'Log in to add or confirm routes.',
      logIn: 'Log in / Sign up',
    },
    badges: {
      verified: '✓ Verified by commuters',
      unverified: '⚠ Unverified · added by a commuter',
      disputed: '✕ Disputed · reported by commuters',
    },
    counts: (confirmed: number, reported: number) => `${confirmed} confirmed · ${reported} reported`,
    thanksConfirm: 'Thanks for confirming!',
    thanksReport: (reason: string) => `Thanks! You reported: ${reason}.`,
    youAdded: 'You added this',
    confirm: 'I’ve ridden this ✓',
    confirmHint: 'Confirm you have ridden this route',
    report: 'Report a problem',
    changeReport: 'Change report',
    reportHint: 'Report this route as wrong, not running, or fake',
    whatsWrong: 'What’s wrong?',
    reasons: {
      wrong_path: 'Wrong path',
      not_running: 'No longer running',
      spam: 'Spam / fake',
    } as Record<ReportReason, string>,
    voteFailed: 'Couldn’t send. Try again.',
  },

  addRoute: {
    notSetUp: 'Community routes aren’t set up yet.',
    notSetUpBody: 'Set EXPO_PUBLIC_API_URL to the Ruta API (server/) to let commuters add routes.',
    logInToAdd: 'Log in to add a route.',
    logIn: 'Log in / Sign up',
    instructionsRide: (click: boolean) =>
      `${click ? 'Click' : 'Tap'} on the road at the first terminal, wherever the jeep turns, and at the last terminal. The line follows the streets between your ${click ? 'clicks' : 'taps'}; if it takes a wrong turn, undo and ${click ? 'click' : 'tap'} the right road.`,
    instructionsWalk: (click: boolean) =>
      `${click ? 'Click' : 'Tap'} where the walk starts and ends, close to the jeep lines it connects, plus any turns. The line follows footpaths; switch to straight lines for walkways the map doesn’t know (malls, footbridges).`,
    bigGap: 'Two points are more than 5 km apart. Add points in between along the road.',
    tooLong: (max: number) =>
      `Walk links can be up to ${max} km. Split a longer walk, or add it as a jeep or tricycle route.`,
    type: 'Type',
    signboard: 'Signboard',
    signboardPlaceholder: 'e.g. CUBAO – QUIAPO',
    from: 'From',
    to: 'To',
    endPlaceholder: 'Tap the map, or type',
    via: 'Via (optional)',
    viaPlaceholder: 'e.g. Aurora Blvd',
    viaWalk: 'Path (optional)',
    viaWalkPlaceholder: 'e.g. footbridge, SM Cubao walkway',
    city: 'City (for fares)',
    otherCity: 'Other',
    direction: 'Direction',
    directions: { both: 'Both ways', oneway: 'One way' },
    onewayHint: 'Draw the points in the direction the vehicle travels.',
    hours: 'Operating hours (optional)',
    hoursPlaceholder: 'e.g. 5:00 AM – 10:00 PM',
    missing: (items: string[]) => `Still needed: ${items.join(', ')}.`,
    missingItems: {
      points: 'at least 2 points on the map',
      signboard: 'the signboard',
      from: 'where it starts',
      to: 'where it ends',
    },
    submitRide: 'Submit route',
    submitWalk: 'Submit walk link',
    footnote:
      'New routes show as “unverified” until other commuters confirm them. Routes that get more reports than confirmations are hidden from trip suggestions.',
    undo: '↶ Undo',
    clear: 'Clear',
    followRoads: '✓ Follow roads',
    followPaths: '✓ Follow paths',
    straight: 'Straight lines',
    stats: (points: number, km: number) => `${points} points · ${km.toFixed(1)} km`,
    snap: {
      loading: 'Following the roads…',
      noRoad: 'No road connects these points: drawn as straight lines.',
      unavailable: 'Road snapping is unavailable right now: drawn as straight lines.',
    },
  },

  auth: {
    signUpTitle: 'Create an account',
    logInTitle: 'Log in',
    introAddRoute: 'Log in to add a route. Other commuters will see your username on it.',
    intro: 'Log in to add routes and confirm routes you’ve ridden.',
    username: 'Username',
    usernamePlaceholder: 'e.g. juan_commuter',
    password: 'Password',
    passwordPlaceholder: (min: number) => `At least ${min} characters`,
    usernameRule: '3–20 letters, numbers, _ or .',
    signUp: 'Sign up',
    logIn: 'Log in',
    toLogIn: 'Already have an account? Log in',
    toSignUp: 'No account yet? Sign up',
    wrongCredentials: 'Wrong username or password.',
    usernameTaken: 'That username is taken.',
  },

  fares: {
    title: 'Fares',
    discounts: {
      regular: 'Regular',
      student: 'Student',
      senior: 'Senior',
      pwd: 'PWD',
    } as Record<DiscountType, string>,
    discountNote: 'Students, senior citizens and PWDs get 20% off. Show your ID.',
    calculator: 'Fare calculator',
    distanceLabel: 'Distance in kilometers',
    enterDistance: 'Enter a distance in km.',
    tricycleQc: 'Tricycle (QC)',
    matrixTitle: 'Jeepney fare matrix',
    jeepRule: (base: number, baseKm: number, perKm: string) =>
      `₱${base} for the first ${baseKm} km, then +₱${perKm}/km`,
    tricycleTitle: 'Tricycle',
    columns: { km: 'km', city: 'City', base: 'Base', perKm: 'Per km', special: 'Special' },
    cities: {
      quezon_city: 'Quezon City',
      manila: 'Manila',
      default: 'Other LGUs (estimate)',
    } as Record<string, string>,
    effective: (date: string) => `Effective ${date}.`,
  },
};

export type Messages = typeof en;
