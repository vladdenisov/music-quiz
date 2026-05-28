export const GENERATION_LANGUAGES = ["any", "english", "russian", "mixed"] as const;

export const GENERATION_DECADES = [
  "1950s",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "2000s",
  "2010s",
  "2020s"
] as const;

export const GENERATION_POPULARITY = ["mainstream", "popular", "balanced", "deep_cuts", "discovery"] as const;
export const GENERATION_DIFFICULTY = ["easy", "medium", "hard", "expert"] as const;
export const GENERATION_EXPLICITNESS = ["clean", "allow_explicit"] as const;

export const GENERATION_GENRES = [
  "pop",
  "dance_pop",
  "electropop",
  "synthpop",
  "indie_pop",
  "k_pop",
  "j_pop",
  "rock",
  "classic_rock",
  "hard_rock",
  "alternative_rock",
  "indie_rock",
  "punk",
  "post_punk",
  "metal",
  "nu_metal",
  "hip_hop",
  "rap",
  "trap",
  "r_and_b",
  "soul",
  "funk",
  "disco",
  "house",
  "techno",
  "trance",
  "drum_and_bass",
  "dubstep",
  "edm",
  "ambient",
  "lo_fi",
  "jazz",
  "blues",
  "country",
  "folk",
  "reggae",
  "latin",
  "reggaeton",
  "classical",
  "soundtrack",
  "rus_pop",
  "rus_rock",
  "rus_rap",
  "shanson",
  "bard",
  "post_soviet",
  "children"
] as const;

export const GENERATION_MOODS = [
  "party",
  "dance",
  "workout",
  "road_trip",
  "romantic",
  "sad",
  "chill",
  "nostalgic",
  "summer",
  "winter",
  "cinematic",
  "aggressive",
  "funny",
  "karaoke",
  "school",
  "new_year"
] as const;

export const GENERATION_REGIONS = [
  "global",
  "US",
  "GB",
  "RU",
  "KZ",
  "UA",
  "DE",
  "FR",
  "IT",
  "ES",
  "BR",
  "MX",
  "KR",
  "JP"
] as const;

export type GenerationLanguage = (typeof GENERATION_LANGUAGES)[number];
export type GenerationDecade = (typeof GENERATION_DECADES)[number];
export type GenerationGenre = (typeof GENERATION_GENRES)[number];
export type GenerationMood = (typeof GENERATION_MOODS)[number];
export type GenerationRegion = (typeof GENERATION_REGIONS)[number];
export type GenerationPopularity = (typeof GENERATION_POPULARITY)[number];
export type GenerationDifficulty = (typeof GENERATION_DIFFICULTY)[number];
export type GenerationExplicitness = (typeof GENERATION_EXPLICITNESS)[number];

export type GenerationFilters = {
  language?: GenerationLanguage;
  decades?: GenerationDecade[];
  genres?: GenerationGenre[];
  moods?: GenerationMood[];
  region?: GenerationRegion;
  popularity?: GenerationPopularity;
  difficulty?: GenerationDifficulty;
  explicitness?: GenerationExplicitness;
};

type Option<T extends string> = {
  id: T;
  label: string;
  description?: string;
  spotifyQuery?: string;
};

export const GENERATION_OPTIONS = {
  languages: [
    option("any", "Any language", "Do not bias generation by language."),
    option("english", "English", "English-language tracks and international hits.", "english"),
    option("russian", "Russian", "Russian-language and post-Soviet tracks.", "russian"),
    option("mixed", "Mixed", "Blend English, Russian, and global tracks.")
  ] satisfies Option<GenerationLanguage>[],

  decades: [
    option("1950s", "1950s", "Early rock and roll, jazz standards, classic vocal pop.", "year:1950-1959"),
    option("1960s", "1960s", "Beat, soul, psychedelic rock, Motown.", "year:1960-1969"),
    option("1970s", "1970s", "Disco, funk, classic rock, singer-songwriters.", "year:1970-1979"),
    option("1980s", "1980s", "New wave, synthpop, glam, stadium rock.", "year:1980-1989"),
    option("1990s", "1990s", "Eurodance, grunge, Britpop, golden-era hip-hop.", "year:1990-1999"),
    option("2000s", "2000s", "Pop-punk, R&B, dance-pop, nu metal, ringtone-era hits.", "year:2000-2009"),
    option("2010s", "2010s", "Streaming-era pop, EDM, trap, indie, K-pop.", "year:2010-2019"),
    option("2020s", "2020s", "Current pop, viral tracks, modern rap, new electronic.", "year:2020-2026")
  ] satisfies Option<GenerationDecade>[],

  genres: [
    option("pop", "Pop", "Broad mainstream pop.", "genre:pop"),
    option("dance_pop", "Dance pop", "Club-friendly radio pop.", "genre:dance"),
    option("electropop", "Electropop", "Electronic pop hooks.", "genre:electropop"),
    option("synthpop", "Synthpop", "Synth-heavy pop and new wave.", "genre:synth-pop"),
    option("indie_pop", "Indie pop", "Alternative pop with lighter production.", "genre:indie-pop"),
    option("k_pop", "K-pop", "Korean pop hits.", "genre:k-pop"),
    option("j_pop", "J-pop", "Japanese pop hits.", "genre:j-pop"),
    option("rock", "Rock", "Broad rock catalog.", "genre:rock"),
    option("classic_rock", "Classic rock", "Classic guitar-driven hits.", "genre:classic-rock"),
    option("hard_rock", "Hard rock", "Heavy guitar rock.", "genre:hard-rock"),
    option("alternative_rock", "Alternative rock", "Alternative and modern rock.", "genre:alternative"),
    option("indie_rock", "Indie rock", "Indie and garage rock.", "genre:indie"),
    option("punk", "Punk", "Punk rock and pop-punk.", "genre:punk"),
    option("post_punk", "Post-punk", "Post-punk and dark wave.", "genre:post-punk"),
    option("metal", "Metal", "Heavy metal and modern metal.", "genre:metal"),
    option("nu_metal", "Nu metal", "Late 90s and 2000s nu metal.", "genre:nu-metal"),
    option("hip_hop", "Hip-hop", "Hip-hop classics and hits.", "genre:hip-hop"),
    option("rap", "Rap", "Rap-focused questions.", "genre:rap"),
    option("trap", "Trap", "Modern trap and melodic rap.", "genre:trap"),
    option("r_and_b", "R&B", "R&B and contemporary soul.", "genre:r-n-b"),
    option("soul", "Soul", "Classic and modern soul.", "genre:soul"),
    option("funk", "Funk", "Funk grooves and classics.", "genre:funk"),
    option("disco", "Disco", "Disco and dancefloor classics.", "genre:disco"),
    option("house", "House", "House music.", "genre:house"),
    option("techno", "Techno", "Techno and club electronic.", "genre:techno"),
    option("trance", "Trance", "Trance classics and anthems.", "genre:trance"),
    option("drum_and_bass", "Drum and bass", "D&B and jungle.", "genre:drum-and-bass"),
    option("dubstep", "Dubstep", "Dubstep and bass music.", "genre:dubstep"),
    option("edm", "EDM", "Festival and radio EDM.", "genre:edm"),
    option("ambient", "Ambient", "Ambient and atmospheric electronic.", "genre:ambient"),
    option("lo_fi", "Lo-fi", "Lo-fi beats and chill tracks.", "genre:lo-fi"),
    option("jazz", "Jazz", "Jazz standards and accessible classics.", "genre:jazz"),
    option("blues", "Blues", "Blues classics.", "genre:blues"),
    option("country", "Country", "Country hits.", "genre:country"),
    option("folk", "Folk", "Folk and acoustic songwriting.", "genre:folk"),
    option("reggae", "Reggae", "Reggae and dancehall.", "genre:reggae"),
    option("latin", "Latin", "Latin pop and crossover hits.", "genre:latin"),
    option("reggaeton", "Reggaeton", "Reggaeton hits.", "genre:reggaeton"),
    option("classical", "Classical", "Recognizable classical works.", "genre:classical"),
    option("soundtrack", "Soundtrack", "Movie, TV, and game music.", "genre:soundtracks"),
    option("rus_pop", "Русская поп-музыка", "Российские и русскоязычные поп-хиты.", "russian pop"),
    option("rus_rock", "Русский рок", "Русский рок и постсоветская рок-сцена.", "russian rock"),
    option("rus_rap", "Русский рэп", "Русскоязычный рэп и хип-хоп.", "russian rap"),
    option("shanson", "Шансон", "Русский шансон и городской романс.", "russian chanson"),
    option("bard", "Бардовская песня", "Авторская песня и акустическая классика.", "bard song"),
    option("post_soviet", "Постсоветские хиты", "Популярная музыка России и СНГ.", "post soviet hits"),
    option("children", "Children songs", "Family-friendly recognizable songs.", "children music")
  ] satisfies Option<GenerationGenre>[],

  moods: [
    option("party", "Party", "Recognizable party tracks.", "party"),
    option("dance", "Dance", "Dancefloor-friendly tracks.", "dance"),
    option("workout", "Workout", "High-energy tracks.", "workout"),
    option("road_trip", "Road trip", "Driving and singalong tracks.", "road trip"),
    option("romantic", "Romantic", "Love songs and ballads.", "love"),
    option("sad", "Sad", "Melancholic and emotional songs.", "sad"),
    option("chill", "Chill", "Relaxed tracks.", "chill"),
    option("nostalgic", "Nostalgic", "Nostalgia-heavy familiar songs.", "nostalgia"),
    option("summer", "Summer", "Summer hits.", "summer"),
    option("winter", "Winter", "Winter and holiday-adjacent tracks.", "winter"),
    option("cinematic", "Cinematic", "Dramatic or soundtrack-like tracks.", "cinematic"),
    option("aggressive", "Aggressive", "Heavy, loud, energetic tracks.", "aggressive"),
    option("funny", "Funny", "Novelty and humorous songs.", "funny"),
    option("karaoke", "Karaoke", "Singalong-friendly hits.", "karaoke"),
    option("school", "School", "Teen, student, and graduation-associated songs.", "school"),
    option("new_year", "New Year", "New Year and holiday party tracks.", "new year")
  ] satisfies Option<GenerationMood>[],

  popularity: [
    option("mainstream", "Mainstream", "Very recognizable hits."),
    option("popular", "Popular", "Known tracks, but not only the biggest hits."),
    option("balanced", "Balanced", "Mix of hits and moderately known tracks."),
    option("deep_cuts", "Deep cuts", "Harder album tracks and less obvious songs."),
    option("discovery", "Discovery", "Less familiar tracks for advanced players.")
  ] satisfies Option<GenerationPopularity>[],

  difficulty: [
    option("easy", "Easy", "Famous songs and very distinct artists."),
    option("medium", "Medium", "Recognizable tracks with plausible distractors."),
    option("hard", "Hard", "Less obvious tracks and closer distractors."),
    option("expert", "Expert", "Deep cuts, niche genres, and very close distractors.")
  ] satisfies Option<GenerationDifficulty>[],

  explicitness: [
    option("clean", "Clean", "Prefer non-explicit tracks."),
    option("allow_explicit", "Allow explicit", "Explicit tracks are allowed.")
  ] satisfies Option<GenerationExplicitness>[],

  regions: [
    option("global", "Global", "No regional market bias."),
    option("US", "United States", "US market."),
    option("GB", "United Kingdom", "UK market."),
    option("RU", "Russia", "Russian market."),
    option("KZ", "Kazakhstan", "Kazakhstan market."),
    option("UA", "Ukraine", "Ukraine market."),
    option("DE", "Germany", "Germany market."),
    option("FR", "France", "France market."),
    option("IT", "Italy", "Italy market."),
    option("ES", "Spain", "Spain market."),
    option("BR", "Brazil", "Brazil market."),
    option("MX", "Mexico", "Mexico market."),
    option("KR", "South Korea", "South Korea market."),
    option("JP", "Japan", "Japan market.")
  ] satisfies Option<GenerationRegion>[],

  presets: [
    preset("global_hits", "Global hits", { popularity: "mainstream", language: "any" }),
    preset("english_party", "English party hits", { language: "english", moods: ["party", "dance"], popularity: "popular" }),
    preset("russian_party", "Русская вечеринка", { language: "russian", moods: ["party"], genres: ["rus_pop", "rus_rap"] }),
    preset("rus_rock_classics", "Классика русского рока", { language: "russian", genres: ["rus_rock"], decades: ["1980s", "1990s", "2000s"] }),
    preset("retro_70s_80s", "70s-80s retro", { decades: ["1970s", "1980s"], genres: ["disco", "classic_rock", "synthpop"] }),
    preset("nineties", "90s hits", { decades: ["1990s"], popularity: "popular" }),
    preset("zeroes", "2000s hits", { decades: ["2000s"], popularity: "popular" }),
    preset("modern_pop", "Modern pop", { decades: ["2010s", "2020s"], genres: ["pop", "dance_pop", "electropop"] }),
    preset("rock_anthems", "Rock anthems", { genres: ["rock", "classic_rock", "alternative_rock"], popularity: "mainstream" }),
    preset("rap_battle", "Rap battle", { genres: ["hip_hop", "rap", "trap"], difficulty: "medium" }),
    preset("electronic_club", "Electronic club", { genres: ["house", "techno", "edm", "trance"], moods: ["dance"] }),
    preset("karaoke_singalong", "Karaoke singalong", { moods: ["karaoke"], popularity: "mainstream", difficulty: "easy" }),
    preset("hard_mode", "Hard mode", { popularity: "deep_cuts", difficulty: "hard" })
  ]
} as const;

export function getGenerationOptions() {
  return GENERATION_OPTIONS;
}

function option<T extends string>(id: T, label: string, description?: string, spotifyQuery?: string): Option<T> {
  return { id, label, description, spotifyQuery };
}

function preset(id: string, label: string, filters: GenerationFilters) {
  return { id, label, filters };
}
