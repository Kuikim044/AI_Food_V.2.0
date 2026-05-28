/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Restaurant {
  name: string;
  area: string;
  address: string;
  category: string;
  price: number;
  display_price: string;
  isEstimatedPrice: boolean;
  rating: number;
  reviews: number;
  base_score: number;
  image: string;
  map: string;
  source: string;
  isTrusted: boolean;
  pros: string;
  scenario_score?: number;
  scenario_parts?: {
    quality: number;
    popularity: number;
    budget: number;
    categoryFit: number;
    penalties: number;
  };
}

export interface HumanReviewFlag {
  restaurantName: string;
  area: string;
  type: string;
  severity: "low" | "medium" | "high";
  flagCode: string;
  metric: string;
  reason: string;
  action: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
}
