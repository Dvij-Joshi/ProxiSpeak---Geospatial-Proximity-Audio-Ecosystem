export const SITE_URL = 'https://proxi-speak-geospatial-proximity-au-kappa.vercel.app';
export const OG_IMAGE = `${SITE_URL}/images/og-proxispeak.webp`;

export const HOME_FAQS = [
  {
    q: 'How does spatial proximity audio work in ProxiSpeak?',
    a: 'As your avatar walks closer to another teammate on the 2D floor, WebRTC audio fades in smoothly across a 320-pixel earshot radius and pans left or right in stereo. Step away, and voices fade naturally to silence.',
  },
  {
    q: 'Do audio recordings pass through or stay on your servers?',
    a: 'No. Voice streams travel directly peer-to-peer between browsers using encrypted WebRTC (DTLS/SRTP) with Opus 48 kHz audio. Our server handles signaling and avatar coordinates only, so audio bytes are never recorded or mixed centrally.',
  },
  {
    q: 'Can we have private meetings without people outside overhearing?',
    a: 'Yes. Enclosed conference rooms and executive suites use interactive soundproof doors and acoustic wall raycasting. Closing the door isolates audio completely, and outside visitors must use Knock-to-Enter to request access.',
  },
  {
    q: 'Can our organization customize its own virtual office floor plan?',
    a: 'Yes. Using the built-in 2D Office Designer, admins and creators can place walls, soundproof doors, workstation pods, conference tables, and acoustic zones with real-time collision validation.',
  },
  {
    q: 'Which browsers and devices support ProxiSpeak?',
    a: 'ProxiSpeak runs directly in modern Chrome, Edge, Firefox, and Safari on desktop, iOS, and Android with no desktop downloads required. Built-in OpenRelay TURN servers maintain audio connectivity behind strict corporate firewalls.',
  },
];

export const SPATIAL_FAQS = [
  {
    q: 'What is the difference between open workspace earshot and meeting rooms?',
    a: 'In open desk areas, audio covers a 320-pixel natural earshot circle so nearby desks do not overlap across the entire floor. Inside enclosed rooms like the boardroom, coverage expands to 850 pixels so everyone around the table hears clearly.',
  },
  {
    q: 'How do walls affect voice volume?',
    a: 'ProxiSpeak runs real-time 2D line-segment raycasting between avatars. Each wall between two speakers attenuates volume and lowers a Web Audio low-pass filter to simulate physical acoustic muffling.',
  },
  {
    q: 'Why does ProxiSpeak use STUN and TURN servers alongside WebRTC?',
    a: 'Public STUN servers help browsers discover direct peer-to-peer paths across most home routers, while Metered OpenRelay TURN servers relay encrypted packets whenever symmetric NAT or strict corporate firewalls block direct UDP.',
  },
];

export const PAGE_META = {
  '/': {
    title: 'ProxiSpeak: Virtual Office with Spatial Proximity Audio',
    description: 'Walk through a shared 2D virtual office where WebRTC voice chat fades naturally by distance and walls. Host team meetings, knock on doors, and design floors.',
    canonical: `${SITE_URL}/`,
    robots: 'index, follow',
    breadcrumbs: [{ name: 'Home', url: `${SITE_URL}/` }],
    faqs: HOME_FAQS,
  },
  '/spatial-audio': {
    title: 'Spatial Proximity Audio & WebRTC Mesh | ProxiSpeak Guide',
    description: 'Explore how ProxiSpeak delivers low-latency WebRTC peer-to-peer voice with 320px distance attenuation, 3D stereo panning, and real-time acoustic wall muffling.',
    canonical: `${SITE_URL}/spatial-audio`,
    robots: 'index, follow',
    breadcrumbs: [
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Spatial Audio', url: `${SITE_URL}/spatial-audio` },
    ],
    faqs: SPATIAL_FAQS,
  },
  '/templates': {
    title: 'Virtual Office Templates & Floor Plan Designer | ProxiSpeak',
    description: "Browse Corporate Office, Keynote Auditorium, and Sky Rooftop floor plans or design custom soundproof rooms and desks in ProxiSpeak's 2D virtual workspace.",
    canonical: `${SITE_URL}/templates`,
    robots: 'index, follow',
    breadcrumbs: [
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'Templates & Designer', url: `${SITE_URL}/templates` },
    ],
    faqs: [],
  },
  '/about': {
    title: 'About ProxiSpeak: Engineering, Security & Team Credentials',
    description: 'Meet the engineers behind ProxiSpeak, inspect our zero-storage peer-to-peer WebRTC security model, and learn how our 2D spatial workspace empowers remote teams.',
    canonical: `${SITE_URL}/about`,
    robots: 'index, follow',
    breadcrumbs: [
      { name: 'Home', url: `${SITE_URL}/` },
      { name: 'About & Engineering', url: `${SITE_URL}/about` },
    ],
    faqs: [],
  },
  '/404': {
    title: 'Page Not Found (404) | ProxiSpeak Virtual Office Platform',
    description: 'The page you requested could not be found on ProxiSpeak. Return to our virtual office homepage, spatial audio guide, templates, or live workspace dashboard.',
    canonical: `${SITE_URL}/`,
    robots: 'noindex, nofollow',
    breadcrumbs: [],
    faqs: [],
  },
};

export function buildJsonLd(route) {
  const meta = PAGE_META[route] || PAGE_META['/'];
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'ProxiSpeak',
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      sameAs: ['https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem'],
    },
    {
      '@type': 'SoftwareApplication',
      name: 'ProxiSpeak',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web Browser (Chrome, Firefox, Safari, Edge)',
      url: SITE_URL,
      description: PAGE_META['/'].description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      featureList: [
        '320px spatial proximity voice attenuation',
        '3D Web Audio stereo panning',
        'Peer-to-peer encrypted WebRTC audio mesh',
        'Soundproof meeting rooms with knock-to-enter doors',
        'Interactive 2D virtual office floor plan designer',
      ],
    },
  ];

  if (meta.breadcrumbs && meta.breadcrumbs.length > 0) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: meta.breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: crumb.url,
      })),
    });
  }

  if (meta.faqs && meta.faqs.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: meta.faqs.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.a,
        },
      })),
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}
