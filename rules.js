// Updated classification rules and subcategory router for the Bookmark Sorter extension
const BookmarkRules = {
  // Number of bookmarks from the same domain to trigger creating a domain-specific folder
  defaultDomainThreshold: 3,

  // Standard category folders with their associated keywords and domains
  categories: [
    {
      id: "movies_shows",
      name: "Movies & Shows",
      description: "Movies, tv series, dramas, and anime streaming",
      enabled: true,
      subcategories: [
        { id: "movies", name: "Movies" },
        { id: "shows", name: "Webseries & TV Shows" }
      ],
      keywords: [
        "movie", "movies", "film", "films", "cinema", "netflix", "imdb", 
        "webseries", "series", "season", "seasons", "episode", "episodes", 
        "tv-show", "tvshow", "show", "shows", "watch", "stream", "streaming", 
        "anime", "drama", "dramas", "asian", "kissasian", "mkv", "mp4", 
        "torrent", "torrents", "yts", "fmovies", "flix", "bollyflix", 
        "hotstar", "crunchyroll", "voot", "zee5", "mxplayer", "kdrama"
      ],
      domains: [
        "netflix.com", "imdb.com", "rottentomatoes.com", "crunchyroll.com",
        "primevideo.com", "disneyplus.com", "hulu.com", "hbomax.com", 
        "yts.mx", "1337x.to", "fmovies.to", "letterboxd.com", "kissasian.cam",
        "bollyflix.do", "kmmovies.space", "hi-4k.com", "4k-hd.club", "mkvdrama.net"
      ]
    },
    {
      id: "sports",
      name: "Sports & Esports",
      description: "Esports matches, traditional sports, and live sports streaming",
      enabled: true,
      subcategories: [
        { id: "esports", name: "Esports & Gaming" },
        { id: "traditional", name: "Traditional Sports" },
        { id: "streams", name: "Live Sports Streams" }
      ],
      keywords: [
        "sports", "sport", "football", "soccer", "basketball", "cricket", 
        "tennis", "footmob", "espn", "fifa", "uefa", "nba", "nfl", "esports", 
        "esport", "hltv", "vlr", "loltv", "dpm", "dltv", "dota", "valorant", 
        "csgo", "counterstrike", "leagueoflegends", "esl", "stream", "streaming", 
        "live", "buffstream", "crackstream", "sportsurge", "vipbox", "footybite"
      ],
      domains: [
        "vlr.gg", "dpm.lol", "hltv.org", "loltv.gg", "dltv.gg", "hlt.org",
        "footmob.com", "espn.com", "fifa.com", "uefa.com", "nba.com", "nfl.com"
      ]
    },
    {
      id: "study",
      name: "Study & Research",
      description: "Academic papers, online courses, tutorials, and documents",
      enabled: true,
      keywords: [
        "pdf", "pdfs", "epub", "epubs", "document", "documents", "doc", "docs", 
        "docx", "research", "scholar", "wikipedia", "wiki", "arxiv", "coursera", 
        "udemy", "tutorial", "tutorials", "guide", "guides", "course", "courses", 
        "class", "classes", "lecture", "lectures", "notes", "textbook", "textbooks", 
        "homework", "assignment", "assignments", "study", "learn", "learning", 
        "academy", "quizlet", "dictionary"
      ],
      domains: [
        "arxiv.org", "wikipedia.org", "coursera.org", "udemy.com", 
        "edx.org", "researchgate.net", "classroom.google.com", 
        "khanacademy.org", "quizlet.com", "scholar.google.com"
      ]
    },
    {
      id: "software",
      name: "Software & Coding",
      description: "Developer tools, repositories, packages, online web utilities, and AI tools",
      enabled: true,
      keywords: [
        "software", "softwares", "download", "downloads", "install", "installer", 
        "exe", "dmg", "setup", "github", "gitlab", "bitbucket", "stackoverflow", 
        "npm", "pypi", "docker", "kubernetes", "vscode", "api", "code", "coding", 
        "develop", "developer", "programming", "compiler", "python", "javascript", 
        "nodejs", "rust", "golang", "java", "c++", "chatgpt", "openai", "excalidraw", 
        "whiteboard", "draw", "diagram", "sketch", "board", "tool", "tools", "app", "apps"
      ],
      domains: [
        "github.com", "gitlab.com", "stackoverflow.com", "npmjs.com", 
        "pypi.org", "docker.com", "sourceforge.net", "stackexchange.com", 
        "dev.to", "chatgpt.com", "excalidraw.com", "openai.com"
      ]
    },
    {
      id: "adult",
      name: "Adult & 18+",
      description: "Adult video platforms, erotic sites, nude image galleries",
      enabled: false, // Disabled by default for privacy/consent; user can toggle this in the dashboard
      subcategories: [
        { id: "videos", name: "Adult Videos" },
        { id: "nudes", name: "Nude Images" },
        { id: "cams", name: "Live Cams & Strip" }
      ],
      keywords: [
        "porn", "xxx", "nude", "nudes", "sexy", "hentai", "onlyfans", "erotic", 
        "sex", "boobs", "tits", "pussy", "shaved", "busty", "nipples", "hooters", 
        "porno", "adult", "xvideos", "pornhub", "xnxx", "xhamster", "cams", 
        "strip", "redtube", "youporn", "erowall"
      ],
      domains: [
        "pornhub.com", "xvideos.com", "xnxx.com", "xhamster.com", 
        "onlyfans.com", "chaturbate.com", "redtube.com", "youporn.com", 
        "erowall.com", "omg.adult", "pornhub.org", "xasiat.com"
      ]
    },
    {
      id: "social",
      name: "Social & Media",
      description: "Social networking, image sharing, and chat platforms",
      enabled: true,
      keywords: [
        "facebook", "instagram", "twitter", "x.com", "reddit", "linkedin", 
        "tiktok", "snapchat", "pinterest", "tumblr", "discord", "slack", 
        "whatsapp", "telegram", "messenger", "youtube", "vimeo", "twitch", 
        "blogger", "medium"
      ],
      domains: [
        "facebook.com", "instagram.com", "twitter.com", "x.com", 
        "reddit.com", "linkedin.com", "tiktok.com", "pinterest.com", 
        "discord.com", "youtube.com", "vimeo.com", "twitch.tv", "telegram.org"
      ]
    },
    {
      id: "shopping",
      name: "Shopping & Finance",
      description: "E-commerce shops, banking, stock portfolios, and crypto",
      enabled: true,
      keywords: [
        "amazon", "ebay", "aliexpress", "walmart", "target", "shopify", 
        "etsy", "paypal", "stripe", "bank", "banking", "finance", "crypto", 
        "bitcoin", "ethereum", "wallet", "stock", "stocks", "portfolio", 
        "coinbase", "binance", "trading", "invest", "shopping", "buy", 
        "price", "cart", "checkout", "deals", "discount"
      ],
      domains: [
        "amazon.com", "ebay.com", "aliexpress.com", "paypal.com", 
        "coinbase.com", "binance.com", "robinhood.com", "stripe.com"
      ]
    },
    {
      id: "productivity",
      name: "Work & Productivity",
      description: "Task management, collaborative docs, design, and office tools",
      enabled: true,
      keywords: [
        "jira", "confluence", "trello", "asana", "zoom", "meet", "teams", 
        "notion", "figma", "miro", "monday", "drive", "dropbox", "onedrive", 
        "box", "office", "outlook", "gmail", "mail", "calendar", "docs"
      ],
      domains: [
        "drive.google.com", "docs.google.com", "trello.com", "notion.so",
        "figma.com", "dropbox.com", "slack.com", "zoom.us", "gmail.com"
      ]
    }
  ],

  /**
   * Extract the main domain from a URL (e.g. https://www.google.com/search -> google.com)
   * @param {string} urlString 
   * @returns {string}
   */
  getDomain(urlString) {
    try {
      if (!urlString) return "";
      const url = new URL(urlString);
      let hostname = url.hostname.toLowerCase();
      // Remove www. prefix if present
      if (hostname.startsWith("www.")) {
        hostname = hostname.substring(4);
      }
      return hostname;
    } catch (e) {
      return "";
    }
  },

  /**
   * Classify a bookmark based on a weighted scoring algorithm
   * @param {string} title 
   * @param {string} url 
   * @param {Array} activeCategories 
   * @returns {string|null} ID of matched category, or null if no match
   */
  classify(title, url, activeCategories) {
    if (!url) return null;
    const lowerTitle = (title || "").toLowerCase();
    const lowerUrl = url.toLowerCase();
    const domain = this.getDomain(url);

    let bestCategoryId = null;
    let highestScore = 0;

    for (const cat of activeCategories) {
      if (!cat.enabled) continue;

      let score = 0;

      // 1. Direct Domain Match (Highest priority, prioritizing adult domains over general media)
      if (cat.domains && cat.domains.some(d => domain === d || domain.endsWith("." + d))) {
        score += (cat.id === "adult") ? 12.0 : 10.0;
      }

      // 2. Keyword Match (Weighted)
      if (cat.keywords) {
        cat.keywords.forEach(kw => {
          let matched = false;

          // Short keywords (<= 3 chars like 'pdf', 'xxx', 'doc', 'ai', 'tv') need strict word boundaries
          if (kw.length <= 3) {
            const regex = new RegExp("\\b" + this.escapeRegExp(kw) + "\\b|[-_]" + this.escapeRegExp(kw) + "[-_]", "i");
            matched = regex.test(lowerTitle) || regex.test(lowerUrl);
          } else {
            // Longer keywords can use substring matching
            matched = lowerTitle.includes(kw) || lowerUrl.includes(kw);
          }

          if (matched) {
            // Assign weight based on keyword specificity
            let weight = 1.0;
            const genericWords = ["download", "downloads", "free", "watch", "online", "setup", "app", "apps", "tool", "tools", "links", "photos", "wallpapers"];
            const specificWords = ["porn", "xxx", "nude", "nudes", "pornhub", "xvideos", "pdf", "pdfs", "arxiv", "netflix", "imdb", "movie", "movies", "show", "shows", "webseries", "episode", "episodes", "season", "seasons", "erotic", "porno", "boobs", "tits", "pussy", "chatgpt", "excalidraw"];

            if (genericWords.includes(kw)) {
              weight = 0.3; // Give generic keywords low weight
            } else if (specificWords.includes(kw)) {
              weight = 2.0; // Give highly identifying keywords high weight
            }

            score += weight;
          }
        });
      }

      // 3. Category Specific Extra Rules
      if (cat.id === "movies_shows") {
        // Look for Season/Episode codes (S01, E05, S01-S02), movie resolutions, and release formats
        const movieRegex = /\b(s\d+e\d+|s\d+|e\d+|season|episode|web-dl|bluray|2160p|1080p|720p|hdr|dual[- ]audio|multi[- ]audio|x264|x265|hevc|hdrip|brrip)\b/i;
        if (movieRegex.test(lowerTitle) || movieRegex.test(lowerUrl)) {
          score += 2.0;
        }
      }

      if (cat.id === "study") {
        // Look for typical file extensions in URL
        const docRegex = /\.(pdf|epub|docx|xlsx|pptx)(\?|$)/i;
        if (docRegex.test(lowerUrl)) {
          score += 3.0;
        }
      }

      // Compare scores
      if (score > highestScore) {
        highestScore = score;
        bestCategoryId = cat.id;
      }
    }

    // Require a minimum threshold score of 0.5 to prevent random noise grouping
    return highestScore >= 0.5 ? bestCategoryId : null;
  },

  /**
   * Router to classify a bookmark into its specific subcategory
   * @param {string} catId Parent Category ID
   * @param {string} title Bookmark Title
   * @param {string} url Bookmark URL
   * @returns {string} Subcategory ID
   */
  classifySubcategory(catId, title, url) {
    const lowerTitle = (title || "").toLowerCase();
    const lowerUrl = url.toLowerCase();
    const domain = this.getDomain(url);

    if (catId === "movies_shows") {
      const showKeywords = ["series", "webseries", "season", "seasons", "episode", "episodes", "show", "shows", "tv", "tvshow", "tv-show", "kissasian", "drama", "dramas", "kdrama"];
      const showRegex = /\b(s\d+e\d+|s\d+|e\d+|season|episode)\b/i;
      
      const isShow = showKeywords.some(kw => lowerTitle.includes(kw) || lowerUrl.includes(kw)) || showRegex.test(lowerTitle);
      return isShow ? "shows" : "movies";
    }

    if (catId === "adult") {
      const liveKeywords = ["cam", "cams", "chaturbate", "strip", "live", "stream", "camgirl", "webcam"];
      const nudeKeywords = ["image", "images", "photo", "photos", "wallpaper", "wallpapers", "nude", "nudes", "gallery", "galleries", "erowall"];
      
      const isOmgAdult = domain === "omg.adult" || domain.endsWith(".omg.adult");
      if (isOmgAdult || liveKeywords.some(kw => lowerTitle.includes(kw) || lowerUrl.includes(kw))) {
        return "cams";
      }
      if (nudeKeywords.some(kw => lowerTitle.includes(kw) || lowerUrl.includes(kw))) {
        return "nudes";
      }
      return "videos";
    }

    if (catId === "sports") {
      const esportKeywords = ["esports", "esport", "hltv", "vlr", "loltv", "dpm", "dltv", "dota", "valorant", "csgo", "counterstrike", "leagueoflegends", "esl"];
      const esportDomains = ["vlr.gg", "dpm.lol", "hltv.org", "loltv.gg", "dltv.gg", "hlt.org"];
      const streamKeywords = ["stream", "streaming", "live", "buffstream", "crackstream", "sportsurge", "vipbox", "footybite"];

      const isEsports = esportDomains.some(d => domain === d || domain.endsWith("." + d)) ||
                        esportKeywords.some(kw => lowerTitle.includes(kw) || lowerUrl.includes(kw));
      if (isEsports) return "esports";

      const isStream = streamKeywords.some(kw => lowerTitle.includes(kw) || lowerUrl.includes(kw));
      if (isStream) return "streams";

      return "traditional";
    }

    return "default";
  },

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
};
