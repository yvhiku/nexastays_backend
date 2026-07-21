import type { SeoLandingContentBlocks } from './seo-landing-content.types';
import type { SeoLocale } from './seo.types';

type NeighborhoodSlug = 'gueliz' | 'medina' | 'hivernage' | 'palmeraie';

const GUELIZ_EN: SeoLandingContentBlocks = {
  hero_intro:
    "Gueliz is Marrakech's modern district, known for cafés, restaurants, shopping, nightlife, and contemporary hotels. It's ideal for visitors who want city comfort while staying 10–15 minutes from Jemaa el-Fnaa.",
  why_stay_here:
    'Gueliz is Marrakech\'s modern district, known for stylish cafés, rooftop restaurants, designer boutiques, and wide boulevards. It\'s ideal for travelers who want a quieter atmosphere than the Medina while remaining only a short taxi ride from Jemaa el-Fnaa. Popular with couples, digital nomads, and business travelers who prefer international restaurants, reliable WiFi, and easier parking.',
  highlights: [
    { icon: '🚶', label: '10–15 min to Jemaa el-Fnaa', description: 'Quick taxi or calèche to the historic square.' },
    { icon: '☕', label: 'Hundreds of cafés', description: 'From specialty coffee to classic Moroccan cafés.' },
    { icon: '🛍️', label: 'Shopping district', description: 'Boutiques, malls, and design stores along Avenue Mohammed V.' },
    { icon: '🚕', label: 'Easy taxis', description: 'Reliable petit taxis and ride-hailing across Gueliz.' },
    { icon: '🌴', label: 'Modern Marrakech', description: 'Contemporary hotels, art galleries, and rooftop bars.' },
  ],
  ideal_for: ['Couples', 'Digital nomads', 'Business travelers', 'First-time visitors', 'Shopping', 'Nightlife'],
  pros: ['Modern amenities and international dining', 'Easier navigation than the Medina', 'Good hotel and apartment selection', 'Close to Majorelle Garden'],
  cons: ['Less traditional atmosphere than the Medina', 'Can feel busy on main boulevards', 'Fewer authentic riads in the core'],
  avoid_if: ['You want a fully traditional riad experience inside the souks', 'You prefer car-free historic streets only'],
  local_tips: [
    'Modern cafés and specialty coffee shops',
    'Luxury hotels and boutique apartments',
    'Walkable boulevards and tree-lined streets',
    'Shopping malls and designer boutiques',
    'Rooftop bars and international restaurants',
    'Quick access to Majorelle Garden',
  ],
  travel_tips: [
    { label: 'Average taxi to Medina', value: '20–40 MAD' },
    { label: 'Nearest airport', value: 'Marrakech Menara (RAK)' },
    { label: 'Airport transfer', value: '15–20 minutes by taxi' },
    { label: 'Best for', value: 'Couples, nomads, business travelers' },
    { label: 'Languages spoken', value: 'Arabic, French, English in hotels and cafés' },
    { label: 'Best season', value: 'March–May and September–November' },
  ],
  transport: [
    { label: 'Airport', value: 'Marrakech Menara — 15–20 min by taxi' },
    { label: 'Train station', value: 'Marrakech Ville — 10 min by taxi' },
    { label: 'Taxi', value: 'Petit taxis widely available; agree or use meter' },
    { label: 'Walkability', value: 'Very walkable along main boulevards' },
    { label: 'Parking', value: 'Easier than Medina; hotel parking common' },
    { label: 'Car rental', value: 'Available at airport and city agencies' },
  ],
  seasonal_notes: [
    { season: 'Spring', temp_range: '20–28°C', note: 'Best season — pleasant evenings and green parks.' },
    { season: 'Autumn', temp_range: '22–30°C', note: 'Ideal for outdoor dining and sightseeing.' },
    { season: 'Summer', temp_range: '35–42°C', note: 'Very hot midday; plan indoor or pool time.' },
    { season: 'Winter', temp_range: '8–20°C', note: 'Mild days, cool evenings; fewer crowds.' },
  ],
  nearby_poi: [
    {
      name: 'Majorelle Garden',
      href: '/stays/near-majorelle-garden',
      description: 'Iconic blue garden and Yves Saint Laurent museum.',
      distance_km: 2.1,
      travel_time: '15 min taxi',
      cta_label: 'Browse stays nearby',
      cta_href: '/stays/near-majorelle-garden',
    },
    {
      name: 'Jemaa el-Fnaa',
      href: '/stays/near-jemaa-el-fnaa',
      description: 'Historic square, souks, and evening food stalls.',
      distance_km: 3.5,
      travel_time: '10–15 min taxi',
      cta_label: 'Browse stays nearby',
      cta_href: '/stays/near-jemaa-el-fnaa',
    },
    {
      name: 'Marrakech travel guide',
      href: '/guides/marrakech-travel-guide',
      description: 'Plan your trip with verified stays and local insights.',
      cta_label: 'Read guide',
      cta_href: '/guides/marrakech-travel-guide',
    },
  ],
  comparison: {
    vs: 'Medina',
    vs_slug: 'medina',
    vs_href: '/stays/marrakech/medina',
    summary: 'Gueliz offers modern comfort and nightlife; the Medina offers historic atmosphere and traditional riads.',
    rows: [
      { label: 'Atmosphere', left: 'Modern', right: 'Historic' },
      { label: 'Nightlife', left: '★★★★★', right: '★★★', left_rating: 5, right_rating: 3 },
      { label: 'Families', left: '★★★★', right: '★★★', left_rating: 4, right_rating: 3 },
      { label: 'Walking', left: '★★★★★', right: '★★★★★', left_rating: 5, right_rating: 5 },
      { label: 'Luxury', left: '★★★★★', right: '★★★', left_rating: 5, right_rating: 3 },
      { label: 'Traditional', left: '★★', right: '★★★★★', left_rating: 2, right_rating: 5 },
    ],
  },
  faq: [
    {
      question: 'Is Gueliz better than the Medina for first-time visitors?',
      answer:
        'Many first-time visitors split their stay: Gueliz for comfort, restaurants, and easy navigation; the Medina for traditional riads and souks. Gueliz is often easier for arrivals and families.',
    },
    {
      question: 'How far is Gueliz from Jemaa el-Fnaa?',
      answer: 'About 3 km — typically 10–15 minutes by taxi (20–40 MAD) depending on traffic.',
    },
    {
      question: 'Is Gueliz walkable?',
      answer: 'Yes along Avenue Mohammed V and surrounding boulevards. The Medina is a short taxi ride away.',
    },
    {
      question: 'Is Gueliz good for families?',
      answer: 'Yes. Wider streets, modern hotels with pools, and international dining make Gueliz popular with families.',
    },
    {
      question: 'Where should first-time visitors stay in Marrakech?',
      answer: 'Gueliz and Hivernage suit travelers who want modern hotels; the Medina suits those seeking traditional riads near the souks.',
    },
    {
      question: 'Is parking easy in Gueliz?',
      answer: 'Easier than the Medina. Many hotels offer parking; street parking exists on side streets.',
    },
    {
      question: 'What is nightlife like in Gueliz?',
      answer: 'Lively — rooftop bars, lounges, and restaurants along Mohammed V and Hivernage corridors.',
    },
    {
      question: 'Is Gueliz safe for tourists?',
      answer: 'Yes. Gueliz is a well-traveled commercial district. Use normal city precautions and book verified stays.',
    },
  ],
  quick_facts: {
    atmosphere: 'Modern',
    budget: 'Mid-range to luxury',
    nightlife: 5,
    family: 4,
    luxury: 5,
    walkability: 5,
    shopping: 5,
    culture: 3,
    digital_nomads: 4,
    distance_to_center: '10–15 min to Jemaa el-Fnaa',
    taxi_availability: 'Excellent',
  },
  at_a_glance: [
    { icon: '📍', label: 'Distance to Medina', value: '10–15 min taxi' },
    { icon: '🚶', label: 'Walkability', value: 'Very walkable' },
    { icon: '👨‍👩‍👧', label: 'Best for families', value: 'Yes' },
    { icon: '💻', label: 'Digital nomads', value: 'Popular' },
    { icon: '🌃', label: 'Nightlife', value: 'Lively' },
    { icon: '🛍', label: 'Shopping', value: 'Excellent' },
    { icon: '💰', label: 'Budget', value: 'Mid-range to luxury' },
    { icon: '🚖', label: 'Taxi availability', value: 'Easy' },
  ],
  editorial_facts: [
    { label: 'Closest airport', value: 'Marrakech Menara (RAK) — 15–20 min' },
    { label: 'Walking distance to Medina', value: '30+ min on foot; 10–15 min by taxi' },
    { label: 'Best season', value: 'March–May, September–November' },
    { label: 'Languages', value: 'Arabic, French, English' },
  ],
};

const NEIGHBORHOOD_META: Record<
  NeighborhoodSlug,
  { name: string; comparisonVs?: NeighborhoodSlug; comparisonVsName?: string }
> = {
  gueliz: { name: 'Gueliz', comparisonVs: 'medina', comparisonVsName: 'Medina' },
  medina: { name: 'Medina', comparisonVs: 'gueliz', comparisonVsName: 'Gueliz' },
  hivernage: { name: 'Hivernage', comparisonVs: 'gueliz', comparisonVsName: 'Gueliz' },
  palmeraie: { name: 'Palmeraie', comparisonVs: 'medina', comparisonVsName: 'Medina' },
};

function cloneForLocale(blocks: SeoLandingContentBlocks, _locale: SeoLocale): SeoLandingContentBlocks {
  return JSON.parse(JSON.stringify(blocks)) as SeoLandingContentBlocks;
}

function buildMedinaEn(): SeoLandingContentBlocks {
  return {
    hero_intro:
      "The Medina is Marrakech's historic heart — a UNESCO-listed maze of souks, riads, palaces, and Jemaa el-Fnaa. Stay here for authentic atmosphere and walking access to iconic sights.",
    why_stay_here:
      'The Medina offers the most traditional Marrakech experience: riads with interior courtyards, souk shopping, and the energy of Jemaa el-Fnaa. Ideal for culture seekers, photographers, and travelers who want to walk to historic monuments.',
    highlights: [
      { icon: '🕌', label: 'Jemaa el-Fnaa', description: 'Iconic square steps from many riads.' },
      { icon: '🛍️', label: 'Souks', description: 'Spices, textiles, crafts, and bargaining culture.' },
      { icon: '🏛️', label: 'Historic monuments', description: 'Bahia Palace, Ben Youssef, Koutoubia nearby.' },
      { icon: '🚶', label: 'Walkable sights', description: 'Most landmarks reachable on foot within the Medina.' },
    ],
    ideal_for: ['Culture lovers', 'Photographers', 'Couples', 'Adventure travelers'],
    pros: ['Authentic riads and historic atmosphere', 'Walking distance to major sights', 'Unique shopping and dining'],
    cons: ['Narrow streets can be confusing', 'Limited car access', 'Can be noisy near the square'],
    avoid_if: ['You need easy parking or drive everywhere', 'You prefer modern chain hotels'],
    local_tips: ['Traditional riads with interior courtyards', 'Rooftop terraces with Medina views', 'Evening food stalls at Jemaa el-Fnaa', 'Souk shopping and artisan workshops'],
    travel_tips: [
      { label: 'Best for', value: 'Culture, riads, souks' },
      { label: 'Navigation', value: 'Use maps; hire a guide for first visit' },
      { label: 'Best season', value: 'March–May, September–November' },
    ],
    transport: [
      { label: 'Airport', value: '20–25 min by taxi' },
      { label: 'Taxi drop-off', value: 'Use official parking points; walk to riad' },
      { label: 'Walkability', value: 'Excellent inside Medina walls' },
    ],
    seasonal_notes: [
      { season: 'Spring', temp_range: '18–26°C', note: 'Ideal for walking the souks.' },
      { season: 'Summer', temp_range: 'Very hot', note: 'Visit sights early morning.' },
    ],
    nearby_poi: [
      { name: 'Jemaa el-Fnaa', href: '/stays/near-jemaa-el-fnaa', description: 'Heart of the Medina.', travel_time: '5–10 min walk' },
      { name: 'Bahia Palace', href: '/stays/near-bahia-palace', description: 'Stunning 19th-century palace.', travel_time: '10 min walk' },
    ],
    comparison: {
      vs: 'Gueliz',
      vs_slug: 'gueliz',
      vs_href: '/stays/marrakech/gueliz',
      rows: [
        { label: 'Atmosphere', left: 'Historic', right: 'Modern' },
        { label: 'Traditional', left: '★★★★★', right: '★★', left_rating: 5, right_rating: 2 },
        { label: 'Nightlife', left: '★★★', right: '★★★★★', left_rating: 3, right_rating: 5 },
      ],
    },
    faq: [
      { question: 'Is the Medina safe for tourists?', answer: 'Yes in well-traveled areas. Book verified riads and use guides if unsure navigating alleys.' },
      { question: 'Can cars reach Medina riads?', answer: 'Often no — expect to walk from taxi drop-off. Porter services help with luggage.' },
      { question: 'Is the Medina good for families?', answer: 'Possible with planning; Gueliz or Palmeraie may suit families needing pools and parking.' },
      { question: 'How far is the Medina from the airport?', answer: 'About 20–25 minutes by taxi depending on traffic.' },
      { question: 'What is the best area inside the Medina?', answer: 'Near Jemaa el-Fnaa for energy; quieter riads exist in northern/quarter areas.' },
      { question: 'Should I stay in a riad or hotel in the Medina?', answer: 'Riads offer authentic experience; boutique hotels exist near Bab Doukkala.' },
      { question: 'Is the Medina walkable at night?', answer: 'Busy near Jemaa el-Fnaa; stick to lit main routes and book verified stays.' },
      { question: 'Medina vs Gueliz for first visit?', answer: 'Medina for tradition; Gueliz for modern comfort — many visitors combine both.' },
    ],
    quick_facts: { atmosphere: 'Historic', budget: 'Mid-range', nightlife: 3, family: 3, luxury: 3, walkability: 5, shopping: 5, culture: 5, digital_nomads: 2 },
    at_a_glance: [
      { icon: '🕌', label: 'Historic core', value: 'UNESCO Medina' },
      { icon: '🚶', label: 'Walkability', value: 'Excellent' },
      { icon: '🛍', label: 'Souks', value: 'World-famous' },
    ],
    editorial_facts: [
      { label: 'Closest airport', value: 'Marrakech Menara — 20–25 min' },
      { label: 'Best season', value: 'March–May, September–November' },
    ],
  };
}

function buildHivernageEn(): SeoLandingContentBlocks {
  return {
    hero_intro:
      'Hivernage is Marrakech\'s upscale district — luxury hotels, spas, fine dining, and quiet tree-lined streets near Gueliz and the Medina.',
    why_stay_here:
      'Hivernage suits travelers seeking five-star hotels, pool resorts, and a calmer base still close to Gueliz nightlife and restaurants.',
    highlights: [
      { icon: '✨', label: 'Luxury hotels', description: 'Major international and boutique luxury properties.' },
      { icon: '🍽️', label: 'Fine dining', description: 'Upscale restaurants and hotel dining.' },
      { icon: '🌳', label: 'Quiet streets', description: 'Residential feel with palm-lined avenues.' },
    ],
    ideal_for: ['Couples', 'Luxury travelers', 'Honeymoons', 'Business travelers'],
    local_tips: ['Five-star hotels and spas', 'Fine dining and hotel bars', 'Pool resorts', 'Close to Gueliz nightlife'],
    travel_tips: [{ label: 'Best for', value: 'Luxury and couples' }, { label: 'Taxi to Medina', value: '15–20 min' }],
    transport: [{ label: 'Airport', value: '15–20 min' }, { label: 'Parking', value: 'Hotel valet common' }],
    seasonal_notes: [{ season: 'Spring', note: 'Perfect for pool and terrace dining.' }],
    comparison: {
      vs: 'Gueliz',
      vs_slug: 'gueliz',
      vs_href: '/stays/marrakech/gueliz',
      rows: [
        { label: 'Luxury', left: '★★★★★', right: '★★★★', left_rating: 5, right_rating: 4 },
        { label: 'Nightlife', left: '★★★', right: '★★★★★', left_rating: 3, right_rating: 5 },
      ],
    },
    faq: [
      { question: 'Is Hivernage good for couples?', answer: 'Yes — popular for honeymoons and luxury getaways.' },
      { question: 'How far is Hivernage from the Medina?', answer: 'About 15–20 minutes by taxi.' },
      { question: 'Is Hivernage walkable?', answer: 'Walkable within the district; taxi to Gueliz and Medina.' },
      { question: 'Best hotels in Hivernage?', answer: 'Browse verified luxury listings on Nexa Stays with walkthrough video.' },
      { question: 'Hivernage vs Gueliz?', answer: 'Hivernage is quieter and more luxury-focused; Gueliz has more cafés and nightlife.' },
      { question: 'Is parking available?', answer: 'Most luxury hotels offer valet or on-site parking.' },
      { question: 'Family-friendly?', answer: 'Resort-style hotels suit families; pools and space are advantages.' },
      { question: 'Airport distance?', answer: 'Roughly 15–20 minutes by taxi to Marrakech Menara.' },
    ],
    quick_facts: { atmosphere: 'Upscale', budget: 'Luxury', nightlife: 3, family: 4, luxury: 5, walkability: 4, shopping: 3, culture: 2, digital_nomads: 3 },
    at_a_glance: [{ icon: '✨', label: 'Luxury', value: 'Five-star district' }, { icon: '💑', label: 'Couples', value: 'Popular' }],
    editorial_facts: [{ label: 'Best season', value: 'October–April for pool weather' }],
  };
}

function buildPalmeraieEn(): SeoLandingContentBlocks {
  return {
    hero_intro:
      'The Palmeraie is Marrakech\'s palm grove oasis — villa resorts, pools, golf, and space away from the city center, 20 minutes north of the Medina.',
    why_stay_here:
      'Choose the Palmeraie for villa stays, resort pools, golf, and a retreat atmosphere while still accessing Marrakech sights by taxi.',
    highlights: [
      { icon: '🌴', label: 'Palm grove setting', description: 'Resorts among thousands of palm trees.' },
      { icon: '🏊', label: 'Pools & villas', description: 'Large properties with private or shared pools.' },
      { icon: '⛳', label: 'Golf', description: 'Courses and country-club resorts.' },
    ],
    ideal_for: ['Families', 'Groups', 'Luxury travelers', 'Golfers'],
    local_tips: ['Villa rentals with pools', 'Resort spas', 'Golf courses', 'Quiet retreat atmosphere'],
    travel_tips: [{ label: 'Medina taxi', value: '25–35 min' }, { label: 'Best for', value: 'Families and groups' }],
    transport: [{ label: 'Car recommended', value: 'Taxis available; many guests rent cars' }, { label: 'Airport', value: '20–25 min' }],
    comparison: {
      vs: 'Medina',
      vs_slug: 'medina',
      vs_href: '/stays/marrakech/medina',
      rows: [
        { label: 'Space', left: '★★★★★', right: '★★', left_rating: 5, right_rating: 2 },
        { label: 'Culture', left: '★★', right: '★★★★★', left_rating: 2, right_rating: 5 },
      ],
    },
    faq: [
      { question: 'Is the Palmeraie far from Marrakech sights?', answer: 'About 25–35 minutes by taxi to the Medina — plan day trips.' },
      { question: 'Good for families?', answer: 'Yes — villas, pools, and space are ideal for families and groups.' },
      { question: 'Do I need a car?', answer: 'Helpful but not required; taxis and hotel transfers work.' },
      { question: 'Palmeraie vs city center?', answer: 'Palmeraie for retreat and pools; Medina/Gueliz for walking to sights.' },
      { question: 'Best time to visit?', answer: 'Spring and autumn for comfortable pool weather.' },
      { question: 'Luxury options?', answer: 'Many high-end villa and resort listings with verification.' },
      { question: 'Nightlife nearby?', answer: 'Limited in Palmeraie — taxi to Gueliz for bars and restaurants.' },
      { question: 'Airport transfer time?', answer: 'Roughly 20–25 minutes to Marrakech Menara.' },
    ],
    quick_facts: { atmosphere: 'Resort oasis', budget: 'Mid-range to luxury', family: 5, luxury: 5, walkability: 2, culture: 2 },
    at_a_glance: [{ icon: '🌴', label: 'Setting', value: 'Palm grove' }, { icon: '👨‍👩‍👧', label: 'Families', value: 'Excellent' }],
    editorial_facts: [{ label: 'Medina distance', value: '25–35 min by taxi' }],
  };
}

const BUILDERS: Record<NeighborhoodSlug, () => SeoLandingContentBlocks> = {
  gueliz: () => GUELIZ_EN,
  medina: buildMedinaEn,
  hivernage: buildHivernageEn,
  palmeraie: buildPalmeraieEn,
};

export function getMarrakechNeighborhoodContent(
  slug: string,
  locale: SeoLocale,
): SeoLandingContentBlocks | null {
  const key = slug as NeighborhoodSlug;
  if (!BUILDERS[key]) return null;
  const blocks = BUILDERS[key]();
  const meta = NEIGHBORHOOD_META[key];
  if (locale !== 'en') {
    const cloned = cloneForLocale(blocks, locale);
    if (meta.comparisonVs && meta.comparisonVsName && cloned.comparison) {
      cloned.comparison.vs_href = `/stays/marrakech/${meta.comparisonVs}`;
    }
    return cloned;
  }
  return blocks;
}

export const MARRAKECH_NEIGHBORHOOD_SLUGS: NeighborhoodSlug[] = [
  'gueliz',
  'medina',
  'hivernage',
  'palmeraie',
];
