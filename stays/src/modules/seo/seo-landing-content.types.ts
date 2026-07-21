export interface SeoLandingHighlight {
  icon?: string;
  label: string;
  description?: string;
}

export interface SeoLandingKeyValue {
  label: string;
  value: string;
}

export interface SeoLandingSeasonalNote {
  season: string;
  temp_range?: string;
  note: string;
}

export interface SeoLandingPoi {
  name: string;
  href: string;
  description?: string;
  distance_km?: number;
  travel_time?: string;
  cta_label?: string;
  cta_href?: string;
}

export interface SeoLandingComparisonRow {
  label: string;
  left: string;
  right: string;
  left_rating?: number;
  right_rating?: number;
}

export interface SeoLandingComparison {
  vs: string;
  vs_slug?: string;
  vs_href?: string;
  summary?: string;
  rows: SeoLandingComparisonRow[];
}

export interface SeoLandingFaqItem {
  question: string;
  answer: string;
}

export interface SeoLandingQuickFacts {
  atmosphere?: string;
  budget?: string;
  nightlife?: number;
  family?: number;
  luxury?: number;
  walkability?: number;
  shopping?: number;
  culture?: number;
  digital_nomads?: number;
  distance_to_center?: string;
  taxi_availability?: string;
}

export interface SeoLandingAtAGlance {
  icon?: string;
  label: string;
  value: string;
}

export interface SeoLandingContentBlocks {
  hero_intro?: string;
  why_stay_here?: string;
  highlights?: SeoLandingHighlight[];
  ideal_for?: string[];
  pros?: string[];
  cons?: string[];
  avoid_if?: string[];
  local_tips?: string[];
  travel_tips?: SeoLandingKeyValue[];
  transport?: SeoLandingKeyValue[];
  seasonal_notes?: SeoLandingSeasonalNote[];
  nearby_poi?: SeoLandingPoi[];
  comparison?: SeoLandingComparison;
  faq?: SeoLandingFaqItem[];
  quick_facts?: SeoLandingQuickFacts;
  at_a_glance?: SeoLandingAtAGlance[];
  editorial_facts?: SeoLandingKeyValue[];
}
