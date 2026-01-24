/**
 * Collection Module - Phase 1: Add to Collection Modal
 * Handles card collection management with smart parsing and metadata
 */

const CollectionModule = (function() {
    'use strict';
    
    // =========================================================================
    // PLAYER DATABASE CACHE
    // =========================================================================
    let playersDatabase = null;
    let playersDatabaseLoading = false;
    let playersDatabasePromise = null;
    
    /**
     * Load the players database from JSON file
     * Caches the result after first load
     */
    async function loadPlayersDatabase() {
        if (playersDatabase) {
            return playersDatabase;
        }
        
        if (playersDatabaseLoading) {
            return playersDatabasePromise;
        }
        
        playersDatabaseLoading = true;
        playersDatabasePromise = fetch('/static/data/players.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load players database');
                }
                return response.json();
            })
            .then(data => {
                playersDatabase = data.players || [];
                console.log('[COLLECTION] Loaded players database with', playersDatabase.length, 'players');
                playersDatabaseLoading = false;
                return playersDatabase;
            })
            .catch(error => {
                console.error('[COLLECTION] Error loading players database:', error);
                playersDatabaseLoading = false;
                playersDatabase = [];
                return [];
            });
        
        return playersDatabasePromise;
    }
    
    // Pre-load the players database on module initialization
    loadPlayersDatabase();
    
    // =========================================================================
    // NEGATIVE FILTER LIST FOR ATHLETE DETECTION
    // =========================================================================
    const NON_NAME_TERMS = [
        // Grading companies
        'psa', 'bgs', 'sgc', 'cgc', 'csg', 'hga', 'ksa', 'gma', 'aga', 'ace', 'mnt',
        // Card types and keywords
        'rookie', 'card', 'base', 'chrome', 'refractor', 'prizm', 'prism',
        'silver', 'gold', 'auto', 'autograph', 'autographed', 'numbered', 'parallel',
        'insert', 'patch', 'relic', 'jersey', 'memorabilia', 'swatch', 'game-used',
        // Brands and manufacturers
        'topps', 'bowman', 'panini', 'donruss', 'fleer', 'optic', 'upper', 'deck',
        'select', 'mosaic', 'obsidian', 'heritage', 'update', 'series', 'stadium',
        'club', 'archives', 'gallery', 'spectra', 'absolute', 'immaculate',
        'contenders', 'chronicles', 'illusions', 'score', 'leaf', 'national',
        'treasures', 'ginter', 'gypsy', 'queen', 'opening', 'day', 'first', 'best',
        // Box/pack terms
        'box', 'lot', 'pack', 'hobby', 'retail', 'jumbo', 'mega', 'blaster', 'hanger',
        'cello', 'rack', 'fat', 'value', 'case', 'break', 'hit',
        // Variations
        'sp', 'ssp', 'variation', 'variant', 'short', 'print', 'image',
        // Conditions
        'gem', 'mint', 'near', 'excellent', 'good', 'fair', 'poor', 'centered', 'oc',
        // Colors (often part of parallels)
        'pink', 'blue', 'purple', 'orange', 'red', 'green', 'teal', 'aqua', 'black',
        'white', 'yellow', 'sapphire', 'atomic', 'mojo', 'wave', 'shimmer',
        'xfractor', 'speckle', 'camo', 'cracked', 'ice', 'pulsar', 'hyper', 'neon',
        'electric', 'holo', 'holographic', 'foil', 'rainbow', 'velocity', 'cosmic',
        // Common words that aren't names
        'the', 'and', 'or', 'for', 'with', 'from', 'new', 'hot', 'rare', 'nice',
        'graded', 'raw', 'ungraded', 'sealed', 'factory', 'set', 'complete',
        'edition', 'limited', 'exclusive', 'special', 'promo', 'promotional',
        // Numbers
        '1st', '2nd', '3rd', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
        // Other common terms
        'rc', 'rpa', 'ssp', 'sp', 'fs', 'ft', 'pwe', 'bmwt', 'combo', 'team'
    ];
    
    // =========================================================================
    // SET PATTERNS (Expanded - 40+ sets)
    // =========================================================================
    const SET_PATTERNS = [
        // Premium Chrome/Refractor sets (order matters - more specific first)
        { pattern: /topps\s+chrome\s+sapphire/i, name: 'Topps Chrome Sapphire' },
        { pattern: /bowman\s+chrome\s+sapphire/i, name: 'Bowman Chrome Sapphire' },
        { pattern: /topps\s+chrome/i, name: 'Topps Chrome' },
        { pattern: /bowman\s+chrome/i, name: 'Bowman Chrome' },
        { pattern: /bowman\s*'?s?\s+best/i, name: "Bowman's Best" },
        { pattern: /bowman\s+draft/i, name: 'Bowman Draft' },
        { pattern: /bowman\s+platinum/i, name: 'Bowman Platinum' },
        { pattern: /bowman\s+sterling/i, name: 'Bowman Sterling' },
        { pattern: /1st\s+bowman/i, name: '1st Bowman' },
        
        // Panini premium sets
        { pattern: /national\s+treasures/i, name: 'National Treasures' },
        { pattern: /flawless/i, name: 'Flawless' },
        { pattern: /immaculate/i, name: 'Immaculate' },
        { pattern: /spectra/i, name: 'Spectra' },
        { pattern: /obsidian/i, name: 'Obsidian' },
        { pattern: /select/i, name: 'Select' },
        { pattern: /mosaic/i, name: 'Mosaic' },
        { pattern: /prizm/i, name: 'Prizm' },
        { pattern: /optic/i, name: 'Optic' },
        { pattern: /chronicles/i, name: 'Chronicles' },
        { pattern: /contenders/i, name: 'Contenders' },
        { pattern: /absolute/i, name: 'Absolute' },
        { pattern: /illusions/i, name: 'Illusions' },
        { pattern: /donruss\s+elite/i, name: 'Donruss Elite' },
        { pattern: /donruss\s+optic/i, name: 'Donruss Optic' },
        { pattern: /donruss/i, name: 'Donruss' },
        { pattern: /panini/i, name: 'Panini' },
        
        // Topps specialty sets
        { pattern: /stadium\s+club/i, name: 'Stadium Club' },
        { pattern: /allen\s*[&+and]*\s*ginter/i, name: 'Allen & Ginter' },
        { pattern: /gypsy\s+queen/i, name: 'Gypsy Queen' },
        { pattern: /heritage\s+high\s+number/i, name: 'Heritage High Number' },
        { pattern: /heritage/i, name: 'Heritage' },
        { pattern: /archives\s+signature/i, name: 'Archives Signature' },
        { pattern: /archives/i, name: 'Archives' },
        { pattern: /opening\s+day/i, name: 'Opening Day' },
        { pattern: /gallery/i, name: 'Gallery' },
        { pattern: /topps\s+update/i, name: 'Topps Update' },
        { pattern: /topps\s+series\s+2/i, name: 'Topps Series 2' },
        { pattern: /topps\s+series\s+1/i, name: 'Topps Series 1' },
        { pattern: /topps\s+finest/i, name: 'Topps Finest' },
        { pattern: /topps\s+gold\s+label/i, name: 'Topps Gold Label' },
        { pattern: /topps\s+tribute/i, name: 'Topps Tribute' },
        { pattern: /topps\s+inception/i, name: 'Topps Inception' },
        { pattern: /topps\s+tier\s+one/i, name: 'Topps Tier One' },
        { pattern: /topps\s+dynasty/i, name: 'Topps Dynasty' },
        { pattern: /topps\s+luminaries/i, name: 'Topps Luminaries' },
        { pattern: /topps\s+museum/i, name: 'Topps Museum Collection' },
        { pattern: /topps\s+definitive/i, name: 'Topps Definitive' },
        { pattern: /topps\s+transcendent/i, name: 'Topps Transcendent' },
        { pattern: /topps\s+five\s+star/i, name: 'Topps Five Star' },
        { pattern: /topps\s+triple\s+threads/i, name: 'Topps Triple Threads' },
        { pattern: /topps\s+sterling/i, name: 'Topps Sterling' },
        { pattern: /topps\s+now/i, name: 'Topps Now' },
        { pattern: /topps\s+project/i, name: 'Topps Project' },
        
        // Classic/Vintage sets
        { pattern: /upper\s+deck/i, name: 'Upper Deck' },
        { pattern: /fleer\s+ultra/i, name: 'Fleer Ultra' },
        { pattern: /fleer/i, name: 'Fleer' },
        { pattern: /score/i, name: 'Score' },
        { pattern: /pro\s+set/i, name: 'Pro Set' },
        { pattern: /leaf/i, name: 'Leaf' },
        { pattern: /classic/i, name: 'Classic' },
        
        // Catch-all patterns (keep at end)
        { pattern: /topps/i, name: 'Topps' },
        { pattern: /bowman/i, name: 'Bowman' }
    ];
    
    // =========================================================================
    // VARIATION PATTERNS (Expanded - 50+ variations)
    // =========================================================================
    const VARIATION_PATTERNS = [
        // Refractors (order matters - more specific first)
        { pattern: /gold\s+refractor/i, name: 'Gold Refractor' },
        { pattern: /black\s+refractor/i, name: 'Black Refractor' },
        { pattern: /blue\s+refractor/i, name: 'Blue Refractor' },
        { pattern: /green\s+refractor/i, name: 'Green Refractor' },
        { pattern: /orange\s+refractor/i, name: 'Orange Refractor' },
        { pattern: /purple\s+refractor/i, name: 'Purple Refractor' },
        { pattern: /red\s+refractor/i, name: 'Red Refractor' },
        { pattern: /pink\s+refractor/i, name: 'Pink Refractor' },
        { pattern: /aqua\s+refractor/i, name: 'Aqua Refractor' },
        { pattern: /atomic\s+refractor/i, name: 'Atomic Refractor' },
        { pattern: /x-?fractor/i, name: 'Xfractor' },
        { pattern: /superfractor/i, name: 'Superfractor' },
        { pattern: /refractor/i, name: 'Refractor' },
        
        // Prizm variations (NOT the set - variations within sets)
        { pattern: /silver\s+prizm/i, name: 'Silver Prizm' },
        { pattern: /gold\s+prizm/i, name: 'Gold Prizm' },
        { pattern: /black\s+prizm/i, name: 'Black Prizm' },
        { pattern: /blue\s+prizm/i, name: 'Blue Prizm' },
        { pattern: /red\s+prizm/i, name: 'Red Prizm' },
        { pattern: /green\s+prizm/i, name: 'Green Prizm' },
        { pattern: /purple\s+prizm/i, name: 'Purple Prizm' },
        { pattern: /orange\s+prizm/i, name: 'Orange Prizm' },
        { pattern: /pink\s+prizm/i, name: 'Pink Prizm' },
        { pattern: /neon\s+green\s+prizm/i, name: 'Neon Green Prizm' },
        { pattern: /red\s+white\s+blue\s+prizm/i, name: 'Red White Blue Prizm' },
        { pattern: /camo\s+prizm/i, name: 'Camo Prizm' },
        { pattern: /cracked\s+ice\s+prizm/i, name: 'Cracked Ice Prizm' },
        { pattern: /mojo\s+prizm/i, name: 'Mojo Prizm' },
        { pattern: /shimmer\s+prizm/i, name: 'Shimmer Prizm' },
        { pattern: /wave\s+prizm/i, name: 'Wave Prizm' },
        { pattern: /fast\s+break\s+prizm/i, name: 'Fast Break Prizm' },
        { pattern: /disco\s+prizm/i, name: 'Disco Prizm' },
        { pattern: /hyper\s+prizm/i, name: 'Hyper Prizm' },
        { pattern: /snakeskin\s+prizm/i, name: 'Snakeskin Prizm' },
        { pattern: /pulsar\s+prizm/i, name: 'Pulsar Prizm' },
        
        // Special effects/finishes
        { pattern: /sapphire/i, name: 'Sapphire' },
        { pattern: /atomic/i, name: 'Atomic' },
        { pattern: /mojo/i, name: 'Mojo' },
        { pattern: /wave/i, name: 'Wave' },
        { pattern: /shimmer/i, name: 'Shimmer' },
        { pattern: /speckle/i, name: 'Speckle' },
        { pattern: /camo/i, name: 'Camo' },
        { pattern: /cracked\s+ice/i, name: 'Cracked Ice' },
        { pattern: /pulsar/i, name: 'Pulsar' },
        { pattern: /hyper/i, name: 'Hyper' },
        { pattern: /velocity/i, name: 'Velocity' },
        { pattern: /cosmic/i, name: 'Cosmic' },
        { pattern: /holo/i, name: 'Holo' },
        { pattern: /holographic/i, name: 'Holographic' },
        { pattern: /rainbow/i, name: 'Rainbow' },
        { pattern: /neon/i, name: 'Neon' },
        { pattern: /electric/i, name: 'Electric' },
        { pattern: /laser/i, name: 'Laser' },
        
        // Color parallels (without refractor/prizm suffix)
        { pattern: /\bsilver\b(?!\s+prizm)/i, name: 'Silver' },
        { pattern: /\bgold\b(?!\s+(refractor|prizm|label))/i, name: 'Gold' },
        { pattern: /\bblack\b(?!\s+(refractor|prizm))/i, name: 'Black' },
        { pattern: /\bblue\b(?!\s+(refractor|prizm))/i, name: 'Blue' },
        { pattern: /\bred\b(?!\s+(refractor|prizm|white))/i, name: 'Red' },
        { pattern: /\bgreen\b(?!\s+(refractor|prizm))/i, name: 'Green' },
        { pattern: /\bpurple\b(?!\s+(refractor|prizm))/i, name: 'Purple' },
        { pattern: /\borange\b(?!\s+(refractor|prizm))/i, name: 'Orange' },
        { pattern: /\bpink\b(?!\s+(refractor|prizm))/i, name: 'Pink' },
        { pattern: /\bteal\b/i, name: 'Teal' },
        { pattern: /\baqua\b(?!\s+refractor)/i, name: 'Aqua' },
        { pattern: /\byellow\b/i, name: 'Yellow' },
        
        // Special types
        { pattern: /1st\s+edition/i, name: '1st Edition' },
        { pattern: /first\s+edition/i, name: 'First Edition' },
        { pattern: /\bchrome\b/i, name: 'Chrome' },
        { pattern: /\bpaper\b/i, name: 'Paper' },
        { pattern: /\bbase\b/i, name: 'Base' },
        { pattern: /\bfoil\b/i, name: 'Foil' },
        
        // Autograph/Relic
        { pattern: /auto(?:graph)?(?:ed)?/i, name: 'Auto' },
        { pattern: /\brelic\b/i, name: 'Relic' },
        { pattern: /\bpatch\b/i, name: 'Patch' },
        { pattern: /\bjersey\b/i, name: 'Jersey' },
        { pattern: /game[- ]?used/i, name: 'Game-Used' },
        { pattern: /\bmemorabilia\b/i, name: 'Memorabilia' },
        
        // Rookie indicators
        { pattern: /\brc\b/i, name: 'RC' },
        { pattern: /\brookie\b/i, name: 'Rookie' },
        { pattern: /\brpa\b/i, name: 'RPA' },
        
        // Short prints
        { pattern: /\bssp\b/i, name: 'SSP' },
        { pattern: /\bsp\b/i, name: 'SP' },
        { pattern: /short\s+print/i, name: 'Short Print' },
        { pattern: /image\s+variation/i, name: 'Image Variation' },
        { pattern: /photo\s+variation/i, name: 'Photo Variation' },
        
        // Numbered patterns (e.g., /25, /50, /99)
        { pattern: /\/\s*(\d+)\b/, name: null }  // Special handling for numbered cards
    ];
    
    // =========================================================================
    // CARD NUMBER PATTERNS (Expanded)
    // =========================================================================
    const CARD_NUMBER_PATTERNS = [
        // Standard patterns with # symbol
        /(?:card\s*)?#\s*([A-Za-z]*\d+[A-Za-z]*)/i,
        // Prefix patterns like RC-1, SP-25, T-100, US-50
        /\b([A-Z]{1,3}[-]?\d{1,4}[A-Za-z]?)\b/,
        // "card 123" or "card# 123"
        /card\s*#?\s*(\d+[A-Za-z]*)/i,
        // Standalone numbers after player name (contextual - handled separately)
    ];
    
    // =========================================================================
    // SMART PARSER FOR CARD SEARCH STRINGS
    // =========================================================================
    
    /**
     * Smart parser for card search strings with confidence scoring
     * Attempts to extract: Year, Set, Athlete, Card #, Variation/Parallel
     * @param {string} searchString - The search query to parse
     * @returns {Object} Parsed data with confidence levels
     */
    function parseSearchString(searchString) {
        if (!searchString) {
            return {
                year: { value: null, confidence: 'none' },
                set: { value: null, confidence: 'none' },
                athlete: { value: null, confidence: 'none' },
                cardNumber: { value: null, confidence: 'none' },
                variation: { value: null, confidence: 'none' }
            };
        }
        
        const originalString = searchString;
        let workingString = searchString;
        
        const parsed = {
            year: { value: null, confidence: 'none' },
            set: { value: null, confidence: 'none' },
            athlete: { value: null, confidence: 'none' },
            cardNumber: { value: null, confidence: 'none' },
            variation: { value: null, confidence: 'none' }
        };
        
        // =====================================================================
        // STEP 1: Extract Year (4-digit number, typically 1900-2099)
        // =====================================================================
        const yearMatch = workingString.match(/\b(19\d{2}|20\d{2})\b/);
        if (yearMatch) {
            parsed.year = { value: yearMatch[1], confidence: 'high' };
            // Remove year from working string
            workingString = workingString.replace(yearMatch[0], ' ');
        }
        
        // =====================================================================
        // STEP 2: Extract Set Name
        // =====================================================================
        for (const setDef of SET_PATTERNS) {
            const match = workingString.match(setDef.pattern);
            if (match) {
                parsed.set = { value: setDef.name, confidence: 'high' };
                // Remove set from working string
                workingString = workingString.replace(match[0], ' ');
                break;
            }
        }
        
        // =====================================================================
        // STEP 3: Extract Card Number
        // =====================================================================
        for (const pattern of CARD_NUMBER_PATTERNS) {
            const match = workingString.match(pattern);
            if (match && match[1]) {
                // Validate it's not just a year or grading number
                const numValue = match[1];
                if (!/^(19|20)\d{2}$/.test(numValue) && !/^[1-9]\.?[05]?$/.test(numValue)) {
                    parsed.cardNumber = { value: numValue, confidence: 'high' };
                    workingString = workingString.replace(match[0], ' ');
                    break;
                }
            }
        }
        
        // =====================================================================
        // STEP 4: Extract Variations/Parallels
        // =====================================================================
        const variations = [];
        let numberedTo = null;
        
        for (const varDef of VARIATION_PATTERNS) {
            const match = workingString.match(varDef.pattern);
            if (match) {
                if (varDef.name === null && match[1]) {
                    // Numbered card pattern (e.g., /99)
                    numberedTo = match[0];
                } else if (varDef.name) {
                    // Don't add duplicate variation names
                    if (!variations.includes(varDef.name)) {
                        variations.push(varDef.name);
                    }
                }
                // Remove from working string
                workingString = workingString.replace(match[0], ' ');
            }
        }
        
        // Combine variations
        if (variations.length > 0 || numberedTo) {
            let variationString = variations.join(' ');
            if (numberedTo) {
                variationString = variationString ? `${variationString} ${numberedTo}` : numberedTo;
            }
            parsed.variation = { value: variationString.trim(), confidence: 'high' };
        }
        
        // =====================================================================
        // STEP 5: Extract Athlete Name
        // =====================================================================
        parsed.athlete = extractAthleteName(workingString, originalString);
        
        // Log for debugging
        console.log('[COLLECTION] Parsed search string:', originalString);
        console.log('[COLLECTION] Parsed result:', parsed);
        
        return parsed;
    }
    
    /**
     * Extract athlete name from search string
     * Uses player database matching + heuristics
     */
    function extractAthleteName(workingString, originalString) {
        // First, try to match against the player database
        if (playersDatabase && playersDatabase.length > 0) {
            const playerMatch = matchPlayerFromDatabase(originalString);
            if (playerMatch) {
                console.log('[COLLECTION] Parsed with player DB match:', playerMatch.name);
                return { value: playerMatch.name, confidence: 'high' };
            }
        }
        
        // Fall back to heuristic extraction
        return extractAthleteNameHeuristic(workingString);
    }
    
    /**
     * Match player name against the database
     * Priority: full name match → alias match → last name match
     */
    function matchPlayerFromDatabase(searchString) {
        if (!playersDatabase || playersDatabase.length === 0) {
            return null;
        }
        
        const lowerSearch = searchString.toLowerCase();
        
        // Priority 1: Full name match (case-insensitive)
        for (const player of playersDatabase) {
            if (lowerSearch.includes(player.name.toLowerCase())) {
                return player;
            }
        }
        
        // Priority 2: Alias match
        for (const player of playersDatabase) {
            if (player.aliases) {
                for (const alias of player.aliases) {
                    // Use word boundary matching to avoid partial matches
                    const aliasLower = alias.toLowerCase();
                    const aliasRegex = new RegExp(`\\b${escapeRegex(aliasLower)}\\b`, 'i');
                    if (aliasRegex.test(searchString)) {
                        return player;
                    }
                }
            }
        }
        
        // Priority 3: Last name match (less confident, only for common names)
        const words = searchString.split(/\s+/);
        for (const player of playersDatabase) {
            const nameParts = player.name.split(/\s+/);
            const lastName = nameParts[nameParts.length - 1];
            
            // Skip very common/short last names to avoid false positives
            if (lastName.length >= 4 && !isCommonWord(lastName)) {
                for (const word of words) {
                    if (word.toLowerCase() === lastName.toLowerCase()) {
                        // Verify it's likely a name by checking if word is capitalized
                        if (/^[A-Z]/.test(word)) {
                            return player;
                        }
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * Check if a word is a common non-name word
     */
    function isCommonWord(word) {
        const commonWords = [
            'card', 'base', 'auto', 'gold', 'silver', 'blue', 'red', 'green',
            'black', 'white', 'pink', 'chrome', 'rookie', 'insert', 'parallel',
            'first', 'best', 'update', 'series', 'draft', 'club'
        ];
        return commonWords.includes(word.toLowerCase());
    }
    
    /**
     * Escape special regex characters in a string
     */
    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    /**
     * Heuristic extraction of athlete name from search string
     * Used as fallback when player database doesn't match
     */
    function extractAthleteNameHeuristic(workingString) {
        // Clean up the working string
        let cleaned = workingString
            .replace(/[#@$%^&*()_+=\[\]{}|\\:";'<>?,./]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Check for quoted name first
        const quotedMatch = cleaned.match(/"([^"]+)"/);
        if (quotedMatch) {
            const quoted = quotedMatch[1].trim();
            if (!isNonNameTerm(quoted)) {
                return { value: quoted, confidence: 'high' };
            }
        }
        
        // Split into words and filter
        const words = cleaned.split(/\s+/);
        const candidateWords = [];
        
        for (const word of words) {
            // Skip if it's a non-name term
            if (isNonNameTerm(word)) {
                continue;
            }
            
            // Skip numbers and very short words
            if (/^\d+$/.test(word) || word.length < 2) {
                continue;
            }
            
            // Look for capitalized words or words that look like names
            if (/^[A-Z][a-z]+/.test(word) || /^[A-Z]+$/.test(word)) {
                candidateWords.push(word);
            }
        }
        
        // Try to form a name from consecutive capitalized words
        if (candidateWords.length >= 2) {
            // Take first 2-3 words that look like a name
            const nameParts = candidateWords.slice(0, 3);
            return { value: nameParts.join(' '), confidence: 'medium' };
        } else if (candidateWords.length === 1) {
            return { value: candidateWords[0], confidence: 'low' };
        }
        
        return { value: null, confidence: 'none' };
    }
    
    /**
     * Check if a word/phrase is in the non-name terms list
     */
    function isNonNameTerm(word) {
        if (!word) return true;
        const lower = word.toLowerCase();
        return NON_NAME_TERMS.includes(lower);
    }
    
    /**
     * Get value from parsed field only if confidence is high or medium
     * @param {Object} field - Parsed field with value and confidence
     * @returns {string} - Value or empty string
     */
    function getConfidentValue(field) {
        if (!field || !field.value) return '';
        if (field.confidence === 'high' || field.confidence === 'medium') {
            return field.value;
        }
        return '';
    }
    
    /**
     * Get CSS style for confidence indicator
     * @param {Object} field - Parsed field with value and confidence
     * @returns {string} - CSS styles for the input
     */
    function getConfidenceStyle(field) {
        if (!field || !field.value) return '';
        if (field.confidence === 'high') {
            return 'border-color: #34c759; background: linear-gradient(135deg, #f0fff4 0%, #e6ffe6 100%);';
        } else if (field.confidence === 'medium') {
            return 'border-color: #ff9500; background: linear-gradient(135deg, #fffaf0 0%, #fff5e6 100%);';
        }
        return '';
    }
    
    /**
     * Show the Add to Collection modal
     * @param {string} searchQuery - Current search query to parse
     * @param {number} currentFMV - Current Fair Market Value to auto-populate
     * @param {Object} cardData - Optional pre-filled card data
     */
    function showAddToCollectionModal(searchQuery = '', currentFMV = null, cardData = {}) {
        console.log('[COLLECTION] Opening Add to Collection modal');
        console.log('[COLLECTION] Search query:', searchQuery);
        console.log('[COLLECTION] Current FMV:', currentFMV);
        
        // Parse the search string for smart auto-fill
        const parsed = parseSearchString(searchQuery);
        console.log('[COLLECTION] Parsed metadata:', parsed);
        
        // Extract confident values for auto-fill (only high/medium confidence)
        const yearValue = getConfidentValue(parsed.year);
        const setValue = getConfidentValue(parsed.set);
        const athleteValue = getConfidentValue(parsed.athlete);
        const cardNumberValue = getConfidentValue(parsed.cardNumber);
        const variationValue = getConfidentValue(parsed.variation);
        
        // Get confidence styles for visual indicators
        const yearStyle = getConfidenceStyle(parsed.year);
        const setStyle = getConfidenceStyle(parsed.set);
        const athleteStyle = getConfidenceStyle(parsed.athlete);
        const cardNumberStyle = getConfidenceStyle(parsed.cardNumber);
        const variationStyle = getConfidenceStyle(parsed.variation);
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'collection-modal-overlay';
        overlay.className = 'auth-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: fadeIn 0.3s ease;
            overflow-y: auto;
            padding: 1rem;
        `;
        
        // Create modal content
        const modal = document.createElement('div');
        modal.className = 'auth-modal';
        modal.style.cssText = `
            background: var(--card-background);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 600px;
            max-height: 90vh;
            overflow-y: auto;
            position: relative;
            border: 1px solid var(--border-color);
            animation: scaleIn 0.3s ease;
        `;
        
        // Build confidence indicator legend HTML
        const confidenceLegend = `
            <div style="display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 1rem; padding: 0.75rem; background: var(--background-color); border-radius: 8px;">
                <span style="display: flex; align-items: center; gap: 0.25rem;">
                    <span style="width: 12px; height: 12px; border-radius: 3px; background: linear-gradient(135deg, #f0fff4 0%, #e6ffe6 100%); border: 1px solid #34c759;"></span>
                    Auto-filled (high confidence)
                </span>
                <span style="display: flex; align-items: center; gap: 0.25rem;">
                    <span style="width: 12px; height: 12px; border-radius: 3px; background: linear-gradient(135deg, #fffaf0 0%, #fff5e6 100%); border: 1px solid #ff9500;"></span>
                    Auto-filled (review suggested)
                </span>
            </div>
        `;
        
        modal.innerHTML = `
            <div class="auth-modal-header" style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--border-color); position: relative; text-align: center;">
                <h2 style="margin: 0; font-size: 1.75rem; font-weight: 700; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                    ⭐ Add to Collection
                </h2>
                <button class="auth-modal-close" onclick="CollectionModule.hideAddToCollectionModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: transparent; border: none; font-size: 2rem; color: var(--subtle-text-color); cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; padding: 0; box-shadow: none;">
                    &times;
                </button>
            </div>
            
            <div class="auth-modal-body" style="padding: 2rem;">
                ${confidenceLegend}
                <form id="add-to-collection-form">
                    <!-- Card Identity Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            📋 Card Identity
                        </h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Year</label>
                                <input type="text" id="card-year" placeholder="e.g., 2024" value="${yearValue}" maxlength="4" style="${yearStyle}">
                            </div>
                            
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Card Number</label>
                                <input type="text" id="card-number" placeholder="e.g., 1, RC-1" value="${cardNumberValue}" style="${cardNumberStyle}">
                            </div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Set</label>
                            <input type="text" id="card-set" placeholder="e.g., Topps Chrome" value="${setValue}" style="${setStyle}">
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Athlete Name</label>
                            <input type="text" id="card-athlete" placeholder="e.g., Shohei Ohtani" value="${athleteValue}" style="${athleteStyle}">
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Variation / Parallel</label>
                            <input type="text" id="card-variation" placeholder="e.g., Silver Refractor, Base" value="${variationValue}" style="${variationStyle}">
                        </div>
                    </div>
                    
                    <!-- Condition Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            💎 Condition
                        </h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Grading Company</label>
                                <select id="card-grading-company" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color); transition: all 0.3s ease;">
                                    <option value="">Raw (Ungraded)</option>
                                    <option value="PSA">PSA</option>
                                    <option value="BGS">BGS (Beckett)</option>
                                    <option value="SGC">SGC</option>
                                    <option value="CGC">CGC</option>
                                    <option value="CSG">CSG</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Grade</label>
                                <input type="text" id="card-grade" placeholder="e.g., 10, 9.5" maxlength="4">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Financial Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            💰 Financial Details
                        </h3>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Purchase Price ($)</label>
                                <input type="number" id="card-purchase-price" placeholder="0.00" step="0.01" min="0">
                            </div>
                            
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>Date Purchased</label>
                                <input type="date" id="card-purchase-date" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color);">
                            </div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Current FMV ($)</label>
                            <input type="number" id="card-current-fmv" placeholder="0.00" step="0.01" min="0" value="${currentFMV || ''}">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-top: 0.25rem;">
                                ${currentFMV ? 'Auto-filled from search results' : 'Optional - will be updated automatically if enabled'}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Organization Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            📁 Organization
                        </h3>
                        
                        <div class="auth-form-group">
                            <label>Binder</label>
                            <select id="card-binder" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color); transition: all 0.3s ease;">
                                <option value="">Select a binder...</option>
                                <option value="__new__">+ Create New Binder</option>
                            </select>
                        </div>
                        
                        <div id="new-binder-input" style="display: none; margin-top: 1rem;">
                            <div class="auth-form-group" style="margin-bottom: 0;">
                                <label>New Binder Name</label>
                                <input type="text" id="new-binder-name" placeholder="e.g., Rookie Cards 2024">
                            </div>
                        </div>
                        
                        <div class="auth-form-group">
                            <label>Tags (comma-separated)</label>
                            <input type="text" id="card-tags" placeholder="e.g., rookie, investment, PC">
                        </div>
                    </div>
                    
                    <!-- Settings Section -->
                    <div style="margin-bottom: 2rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                            ⚙️ Settings
                        </h3>
                        
                        <div style="background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); padding: 1rem; border-radius: 8px;">
                            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 500; color: var(--text-color);">
                                <input type="checkbox" id="card-auto-update" checked style="width: 20px; height: 20px; cursor: pointer;">
                                <div>
                                    <div>Auto-Update Value</div>
                                    <div style="font-size: 0.85rem; font-weight: 400; color: var(--subtle-text-color); margin-top: 0.25rem;">
                                        Automatically update Fair Market Value every 90 days
                                    </div>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Hidden field for search query -->
                    <input type="hidden" id="card-search-query" value="${escapeHtml(searchQuery)}">
                    
                    <!-- Submit Button -->
                    <button type="submit" class="auth-submit-btn" style="width: 100%; padding: 1rem; background: var(--gradient-primary); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3); margin-top: 1rem;">
                        ⭐ Add to Collection
                    </button>
                </form>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Set up event listeners
        setupModalEventListeners();
        
        // Load user's binders
        loadUserBinders();
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideAddToCollectionModal();
            }
        });
        
        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                hideAddToCollectionModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    /**
     * Set up event listeners for the modal
     */
    function setupModalEventListeners() {
        // Binder selection change
        const binderSelect = document.getElementById('card-binder');
        const newBinderInput = document.getElementById('new-binder-input');
        
        if (binderSelect && newBinderInput) {
            binderSelect.addEventListener('change', (e) => {
                if (e.target.value === '__new__') {
                    newBinderInput.style.display = 'block';
                } else {
                    newBinderInput.style.display = 'none';
                }
            });
        }
        
        // Form submission
        const form = document.getElementById('add-to-collection-form');
        if (form) {
            form.addEventListener('submit', handleAddToCollection);
        }
    }
    
    /**
     * Load user's existing binders from database
     */
    async function loadUserBinders() {
        console.log('[COLLECTION] Loading user binders...');
        
        // Check if user is authenticated
        if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
            console.log('[COLLECTION] User not authenticated');
            return;
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            if (!supabase) {
                console.error('[COLLECTION] Supabase client not available');
                return;
            }
            
            const user = window.AuthModule.getCurrentUser();
            if (!user) {
                console.error('[COLLECTION] No current user');
                return;
            }
            
            // Fetch binders from database
            const { data, error } = await supabase
                .from('binders')
                .select('id, name')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('[COLLECTION] Error loading binders:', error);
                return;
            }
            
            console.log('[COLLECTION] Loaded', data?.length || 0, 'binders');
            
            // Populate binder dropdown
            const binderSelect = document.getElementById('card-binder');
            if (binderSelect && data && data.length > 0) {
                // Clear existing options except the first two
                while (binderSelect.options.length > 2) {
                    binderSelect.remove(2);
                }
                
                // Add binders
                data.forEach(binder => {
                    const option = document.createElement('option');
                    option.value = binder.id;
                    option.textContent = binder.name;
                    binderSelect.appendChild(option);
                });
            }
            
        } catch (error) {
            console.error('[COLLECTION] Exception loading binders:', error);
        }
    }
    
    /**
     * Handle form submission
     */
    async function handleAddToCollection(event) {
        event.preventDefault();
        console.log('[COLLECTION] Submitting card to collection...');
        
        // Check authentication
        if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
            alert('Please log in to add cards to your collection');
            return;
        }
        
        // Gather form data
        const formData = {
            year: document.getElementById('card-year')?.value || null,
            set: document.getElementById('card-set')?.value || null,
            athlete: document.getElementById('card-athlete')?.value || null,
            cardNumber: document.getElementById('card-number')?.value || null,
            variation: document.getElementById('card-variation')?.value || null,
            gradingCompany: document.getElementById('card-grading-company')?.value || null,
            grade: document.getElementById('card-grade')?.value || null,
            purchasePrice: parseFloat(document.getElementById('card-purchase-price')?.value) || null,
            purchaseDate: document.getElementById('card-purchase-date')?.value || null,
            currentFmv: parseFloat(document.getElementById('card-current-fmv')?.value) || null,
            binder: document.getElementById('card-binder')?.value || null,
            newBinderName: document.getElementById('new-binder-name')?.value || null,
            tags: document.getElementById('card-tags')?.value || null,
            autoUpdate: document.getElementById('card-auto-update')?.checked || false,
            searchQuery: document.getElementById('card-search-query')?.value ?? ''
        };
        
        console.log('[COLLECTION] Form data:', formData);
        
        // Validation
        if (!formData.athlete) {
            alert('Please enter the athlete name');
            return;
        }
        
        // Validate search query is not empty (required for automated valuation)
        if (!formData.searchQuery || formData.searchQuery.trim() === '') {
            alert('Search query is required for automated valuation. Please run a search first, then click "Save to Collection".');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '⭐ Add to Collection';
            }
            return;
        }
        
        // Disable submit button
        const submitBtn = event.target.querySelector('.auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Adding to Collection...';
        }
        
        try {
            // Save to database
            const result = await saveCardToCollection(formData);
            
            if (result.error) {
                console.error('[COLLECTION] Error saving card:', result.error);
                alert('Failed to add card: ' + (result.error.message || 'Unknown error'));
                
                // Re-enable button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '⭐ Add to Collection';
                }
            } else {
                console.log('[COLLECTION] Card saved successfully:', result.data);
                
                // Show success message
                if (submitBtn) {
                    submitBtn.textContent = '✅ Added to Collection!';
                    submitBtn.style.background = 'linear-gradient(135deg, #34c759, #30d158)';
                }
                
                // Close modal after delay
                setTimeout(() => {
                    hideAddToCollectionModal();
                    
                    // Refresh portfolio if on that tab
                    if (window.AuthModule && window.AuthModule.displayPortfolio) {
                        const portfolioTab = document.getElementById('portfolio-tab');
                        if (portfolioTab && portfolioTab.classList.contains('active')) {
                            window.AuthModule.displayPortfolio();
                        }
                    }
                }, 1500);
            }
            
        } catch (error) {
            console.error('[COLLECTION] Exception saving card:', error);
            alert('An error occurred while adding the card: ' + error.message);
            
            // Re-enable button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '⭐ Add to Collection';
            }
        }
    }
    
    /**
     * Save card to collection database
     */
    async function saveCardToCollection(formData) {
        const supabase = window.AuthModule.getClient();
        if (!supabase) {
            return { error: { message: 'Database not available' } };
        }
        
        const user = window.AuthModule.getCurrentUser();
        if (!user) {
            return { error: { message: 'User not logged in' } };
        }
        
        try {
            let binderId = formData.binder;
            
            // Create new binder if needed
            if (formData.binder === '__new__' && formData.newBinderName) {
                console.log('[COLLECTION] Creating new binder:', formData.newBinderName);
                
                const { data: binderData, error: binderError } = await supabase
                    .from('binders')
                    .insert([{
                        user_id: user.id,
                        name: formData.newBinderName
                    }])
                    .select()
                    .single();
                
                if (binderError) {
                    console.error('[COLLECTION] Error creating binder:', binderError);
                    return { error: binderError };
                }
                
                binderId = binderData.id;
                console.log('[COLLECTION] Created binder with ID:', binderId);
            }
            
            // Prepare card data
            const cardData = {
                binder_id: binderId,
                user_id: user.id,  // NEW: Add user_id directly to card
                year: formData.year,
                set_name: formData.set,
                athlete: formData.athlete,
                card_number: formData.cardNumber,
                variation: formData.variation,
                grading_company: formData.gradingCompany,
                grade: formData.grade,
                purchase_price: formData.purchasePrice,
                purchase_date: formData.purchaseDate,
                current_fmv: formData.currentFmv,
                search_query_string: formData.searchQuery || '',
                auto_update: formData.autoUpdate,
                tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : []
            };
            
            console.log('[COLLECTION] Saving card data:', cardData);
            
            // Insert card
            const { data, error } = await supabase
                .from('cards')
                .insert([cardData])
                .select();
            
            if (error) {
                console.error('[COLLECTION] Error inserting card:', error);
                return { error };
            }
            
            console.log('[COLLECTION] Card inserted successfully:', data);
            
            // Create initial price history entry if current_fmv was provided
            if (cardData.current_fmv && cardData.current_fmv > 0 && data && data[0]) {
                console.log('[COLLECTION] Creating initial price history entry...');
                
                const { error: historyError } = await supabase
                    .from('price_history')
                    .insert([{
                        card_id: data[0].id,
                        value: cardData.current_fmv,
                        num_sales: null,
                        confidence: 'user_provided'
                    }]);
                
                if (historyError) {
                    console.error('[COLLECTION] Error creating price history:', historyError);
                    // Don't fail the entire save - price history is supplementary
                } else {
                    console.log('[COLLECTION] Price history entry created successfully');
                }
            }
            
            return { data };
            
        } catch (error) {
            console.error('[COLLECTION] Exception in saveCardToCollection:', error);
            return { error: { message: error.message } };
        }
    }
    
    /**
     * Hide the Add to Collection modal
     */
    function hideAddToCollectionModal() {
        const overlay = document.getElementById('collection-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    }
    
    /**
     * Display the binder view dashboard
     * This is the main view for the "My Collection" tab
     */
    async function displayBinderView(sortBy = null) {
        console.log('[COLLECTION] Displaying binder view...');
        
        const container = document.getElementById('portfolio-container');
        if (!container) {
            console.error('[COLLECTION] Portfolio container not found');
            return;
        }
        
        // Get sort preference from localStorage or parameter
        const sortOption = sortBy || localStorage.getItem('binderSort') || 'newest';
        
        // Check authentication
        if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">🔒 Login Required</h3>
                    <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto 1.5rem auto;">Please log in to view your collection</p>
                    <button onclick="AuthModule.showAuthModal()" style="background: var(--gradient-primary); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                        Login
                    </button>
                </div>
            `;
            return;
        }
        
        // Show loading state
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 2rem;">
                <div class="loading">Loading your collection...</div>
            </div>
        `;
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            // Fetch user's binders with card counts
            const { data: binders, error: bindersError } = await supabase
                .from('binders')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (bindersError) {
                throw bindersError;
            }
            
            console.log('[COLLECTION] Loaded', binders?.length || 0, 'binders');
            
            // If no binders, show empty state
            if (!binders || binders.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                        <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📂 No Binders Yet</h3>
                        <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto 1.5rem auto;">Start building your collection by adding cards from the Comps & Analysis tab</p>
                        <button onclick="switchTab('comps')" style="background: var(--gradient-primary); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                            Search for Cards
                        </button>
                    </div>
                `;
                return;
            }
            
            // Fetch cards for each binder to calculate stats
            const bindersWithStats = await Promise.all(binders.map(async (binder) => {
                const { data: cards, error: cardsError } = await supabase
                    .from('cards')
                    .select('*')
                    .eq('binder_id', binder.id);
                
                if (cardsError) {
                    console.error('[COLLECTION] Error loading cards for binder', binder.id, cardsError);
                    return { ...binder, cards: [], stats: null };
                }
                
                // Calculate stats
                const totalCards = cards.length;
                const totalCost = cards.reduce((sum, card) => sum + (parseFloat(card.purchase_price) || 0), 0);
                const totalFMV = cards.reduce((sum, card) => sum + (parseFloat(card.current_fmv) || 0), 0);
                const roi = totalCost > 0 ? ((totalFMV - totalCost) / totalCost * 100) : 0;
                
                return {
                    ...binder,
                    cards,
                    stats: {
                        totalCards,
                        totalCost,
                        totalFMV,
                        roi
                    }
                };
            }));
            
            // Apply sorting based on selection
            bindersWithStats.sort((a, b) => {
                switch(sortOption) {
                    case 'oldest':
                        return new Date(a.created_at) - new Date(b.created_at);
                    case 'az':
                        return a.name.localeCompare(b.name);
                    case 'za':
                        return b.name.localeCompare(a.name);
                    case 'value_high':
                        return (b.stats?.totalFMV || 0) - (a.stats?.totalFMV || 0);
                    case 'value_low':
                        return (a.stats?.totalFMV || 0) - (b.stats?.totalFMV || 0);
                    case 'newest':
                    default:
                        return new Date(b.created_at) - new Date(a.created_at);
                }
            });
            
            // Render binder dashboard
            renderBinderDashboard(bindersWithStats, sortOption);
            
        } catch (error) {
            console.error('[COLLECTION] Error loading binders:', error);
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: #ff3b30; font-size: 1.5rem; font-weight: 600;">⚠️ Error Loading Collection</h3>
                    <p style="margin: 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color);">${error.message || 'Unknown error occurred'}</p>
                </div>
            `;
        }
    }
    
    /**
     * Render the binder dashboard with all binders
     */
    function renderBinderDashboard(binders, sortOption = 'newest') {
        const container = document.getElementById('portfolio-container');
        if (!container) return;
        
        // Calculate overall collection stats
        const totalCards = binders.reduce((sum, b) => sum + (b.stats?.totalCards || 0), 0);
        const totalCost = binders.reduce((sum, b) => sum + (b.stats?.totalCost || 0), 0);
        const totalFMV = binders.reduce((sum, b) => sum + (b.stats?.totalFMV || 0), 0);
        const overallROI = totalCost > 0 ? ((totalFMV - totalCost) / totalCost * 100) : 0;
        
        let html = `
            <!-- Overall Collection Stats -->
            <div style="margin-bottom: 2rem; padding: 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                <h3 style="margin: 0 0 1.5rem 0; font-size: 1.5rem; font-weight: 600; color: var(--text-color);">📊 Collection Overview</h3>
                
                <div class="stat-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    <div class="stat-item">
                        <div class="stat-label">Total Cards</div>
                        <div class="stat-value">${totalCards}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">Total Cost</div>
                        <div class="stat-value">$${totalCost.toFixed(2)}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">Current FMV</div>
                        <div class="stat-value">$${totalFMV.toFixed(2)}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">ROI</div>
                        <div class="stat-value" style="color: ${overallROI >= 0 ? '#34c759' : '#ff3b30'}">
                            ${overallROI >= 0 ? '+' : ''}${overallROI.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Binders Grid Header with Sort -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text-color);">📁 Your Binders</h3>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <label style="font-size: 0.9rem; color: var(--subtle-text-color);">Sort by:</label>
                    <select id="binder-sort" onchange="CollectionModule.sortBindersView(this.value)" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-background); color: var(--text-color); cursor: pointer; font-family: var(--font-family);">
                        <option value="newest" ${sortOption === 'newest' ? 'selected' : ''}>Newest</option>
                        <option value="oldest" ${sortOption === 'oldest' ? 'selected' : ''}>Oldest</option>
                        <option value="az" ${sortOption === 'az' ? 'selected' : ''}>A-Z</option>
                        <option value="za" ${sortOption === 'za' ? 'selected' : ''}>Z-A</option>
                        <option value="value_high" ${sortOption === 'value_high' ? 'selected' : ''}>Highest Value</option>
                        <option value="value_low" ${sortOption === 'value_low' ? 'selected' : ''}>Lowest Value</option>
                    </select>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem;">
        `;
        
        // Render each binder card
        binders.forEach(binder => {
            const stats = binder.stats || {};
            const roiColor = (stats.roi || 0) >= 0 ? '#34c759' : '#ff3b30';
            
            html += `
                <div class="binder-card" onclick="CollectionModule.showBinderDetails('${binder.id}')" style="background: var(--card-background); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05); transition: all 0.3s ease; cursor: pointer; position: relative;">
                    <div style="position: absolute; top: 1rem; right: 1rem;">
                        <button
                            onclick="CollectionModule.showBinderContextMenu('${binder.id}', '${escapeHtml(binder.name).replace(/'/g, "\\'")}', event); event.stopPropagation();"
                            class="options-button"
                            style="
                                background: #f5f5f7;
                                border: 1px solid #e5e5e7;
                                border-radius: 12px;
                                padding: 6px 10px;
                                cursor: pointer;
                                transition: all 0.2s ease;
                                display: inline-flex;
                                flex-direction: column;
                                gap: 3px;
                                align-items: center;
                                justify-content: center;
                                min-width: 32px;
                                min-height: 32px;
                            "
                            onmouseover="
                                this.style.background='#007aff';
                                this.style.borderColor='#007aff';
                                Array.from(this.querySelectorAll('.dot')).forEach(dot => dot.style.background='white');
                            "
                            onmouseout="
                                this.style.background='#f5f5f7';
                                this.style.borderColor='#e5e5e7';
                                Array.from(this.querySelectorAll('.dot')).forEach(dot => dot.style.background='#1d1d1f');
                            "
                            title="Options"
                        >
                            <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                            <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                            <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                        </button>
                    </div>
                    <h4 style="margin: 0 0 1rem 0; font-size: 1.2rem; font-weight: 600; color: var(--text-color); padding-right: 80px;">
                        ${escapeHtml(binder.name)}
                    </h4>
                    
                    <div class="binder-stats" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem;">
                        <div style="text-align: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 0.25rem;">Cards</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-color);">${stats.totalCards || 0}</div>
                        </div>
                        
                        <div style="text-align: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 0.25rem;">FMV</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-color);">$${(stats.totalFMV || 0).toFixed(0)}</div>
                        </div>
                        
                        <div style="text-align: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 0.25rem;">Cost</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: var(--text-color);">$${(stats.totalCost || 0).toFixed(0)}</div>
                        </div>
                        
                        <div style="text-align: center; padding: 0.75rem; background: linear-gradient(135deg, var(--background-color) 0%, #f0f4ff 100%); border-radius: 8px;">
                            <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-bottom: 0.25rem;">ROI</div>
                            <div style="font-size: 1.25rem; font-weight: 700; color: ${roiColor};">
                                ${(stats.roi || 0) >= 0 ? '+' : ''}${(stats.roi || 0).toFixed(1)}%
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color); font-size: 0.85rem; color: var(--subtle-text-color);">
                        Created ${new Date(binder.created_at).toLocaleDateString()}
                    </div>
                </div>
            `;
        });
        
        html += `
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    /**
     * Sort binders view with specified option
     */
    function sortBindersView(sortBy) {
        localStorage.setItem('binderSort', sortBy);
        displayBinderView(sortBy);
    }
    
    /**
     * Sort cards view with specified option
     */
    function sortCardsView(binderId, sortBy) {
        localStorage.setItem('cardSort', sortBy);
        showBinderDetails(binderId, sortBy);
    }
    
    /**
     * Show detailed view of a specific binder with all cards
     */
    async function showBinderDetails(binderId, sortBy = null) {
        console.log('[COLLECTION] Showing binder details for:', binderId);
        
        // Get sort preference from localStorage or parameter
        const sortOption = sortBy || localStorage.getItem('cardSort') || 'newest';
        
        const container = document.getElementById('portfolio-container');
        if (!container) return;
        
        // Show loading state
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 2rem;">
                <div class="loading">Loading binder...</div>
            </div>
        `;
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            // Fetch binder details
            const { data: binder, error: binderError } = await supabase
                .from('binders')
                .select('*')
                .eq('id', binderId)
                .eq('user_id', user.id)
                .single();
            
            if (binderError) {
                throw binderError;
            }
            
            // Fetch all cards in this binder
            const { data: cards, error: cardsError } = await supabase
                .from('cards')
                .select('*')
                .eq('binder_id', binderId)
                .order('created_at', { ascending: false });
            
            if (cardsError) {
                throw cardsError;
            }
            
            console.log('[COLLECTION] Loaded', cards?.length || 0, 'cards for binder');
            
            // Apply sorting based on selection
            cards.sort((a, b) => {
                switch(sortOption) {
                    case 'oldest':
                        return new Date(a.created_at) - new Date(b.created_at);
                    case 'az':
                        return (a.athlete || '').localeCompare(b.athlete || '');
                    case 'za':
                        return (b.athlete || '').localeCompare(a.athlete || '');
                    case 'value_high':
                        return (parseFloat(b.current_fmv) || 0) - (parseFloat(a.current_fmv) || 0);
                    case 'value_low':
                        return (parseFloat(a.current_fmv) || 0) - (parseFloat(b.current_fmv) || 0);
                    case 'newest':
                    default:
                        return new Date(b.created_at) - new Date(a.created_at);
                }
            });
            
            // Render binder detail view
            renderBinderDetailView(binder, cards, sortOption);
            
        } catch (error) {
            console.error('[COLLECTION] Error loading binder details:', error);
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: #ff3b30; font-size: 1.5rem; font-weight: 600;">⚠️ Error Loading Binder</h3>
                    <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color);">${error.message || 'Unknown error occurred'}</p>
                    <button onclick="CollectionModule.displayBinderView()" style="background: var(--gradient-primary); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                        Back to Binders
                    </button>
                </div>
            `;
        }
    }
    
    /**
     * Render detailed view of a binder with card list
     */
    function renderBinderDetailView(binder, cards, sortOption = 'newest') {
        const container = document.getElementById('portfolio-container');
        if (!container) return;
        
        // Calculate binder stats
        const totalCards = cards.length;
        const totalCost = cards.reduce((sum, card) => sum + (parseFloat(card.purchase_price) || 0), 0);
        const totalFMV = cards.reduce((sum, card) => sum + (parseFloat(card.current_fmv) || 0), 0);
        const roi = totalCost > 0 ? ((totalFMV - totalCost) / totalCost * 100) : 0;
        
        // Check for stale cards (>30 days since last update)
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        let html = `
            <!-- Back Button -->
            <div style="margin-bottom: 1.5rem;">
                <button onclick="CollectionModule.displayBinderView()" style="background: var(--background-color); color: var(--text-color); border: 1px solid var(--border-color); padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.3s ease;">
                    ← Back to Binders
                </button>
            </div>
            
            <!-- Binder Header -->
            <div style="margin-bottom: 2rem; padding: 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                <h2 style="margin: 0 0 1.5rem 0; font-size: 2rem; font-weight: 700; color: var(--text-color);">
                    ${escapeHtml(binder.name)}
                </h2>
                
                <!-- Binder Stats -->
                <div class="stat-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
                    <div class="stat-item">
                        <div class="stat-label">Total Cards</div>
                        <div class="stat-value">${totalCards}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">Total Cost</div>
                        <div class="stat-value">$${totalCost.toFixed(2)}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">Current FMV</div>
                        <div class="stat-value">$${totalFMV.toFixed(2)}</div>
                    </div>
                    
                    <div class="stat-item">
                        <div class="stat-label">ROI</div>
                        <div class="stat-value" style="color: ${roi >= 0 ? '#34c759' : '#ff3b30'}">
                            ${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // If no cards, show empty state
        if (cards.length === 0) {
            html += `
                <div style="text-align: center; padding: 3rem 2rem; background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);">
                    <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.5rem; font-weight: 600;">📋 No Cards Yet</h3>
                    <p style="margin: 0 0 1.5rem 0; font-size: 1rem; line-height: 1.6; color: var(--subtle-text-color); max-width: 500px; margin: 0 auto 1.5rem auto;">Add cards to this binder from the Comps & Analysis tab</p>
                    <button onclick="switchTab('comps')" style="background: var(--gradient-primary); color: white; border: none; padding: 0.875rem 1.5rem; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                        Search for Cards
                    </button>
                </div>
            `;
        } else {
            // Render card list table
            html += `
                <div style="background: var(--card-background); border-radius: 16px; border: 1px solid var(--border-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06); overflow: hidden;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; border-bottom: 1px solid var(--border-color);">
                        <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text-color);">Cards (${totalCards})</h3>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <label style="font-size: 0.9rem; color: var(--subtle-text-color);">Sort by:</label>
                            <select id="card-sort" onchange="CollectionModule.sortCardsView('${binder.id}', this.value)" style="padding: 0.5rem 1rem; border-radius: 8px; border: 1px solid var(--border-color); background: var(--card-background); color: var(--text-color); cursor: pointer; font-family: var(--font-family);">
                                <option value="newest" ${sortOption === 'newest' ? 'selected' : ''}>Newest</option>
                                <option value="oldest" ${sortOption === 'oldest' ? 'selected' : ''}>Oldest</option>
                                <option value="az" ${sortOption === 'az' ? 'selected' : ''}>A-Z (Athlete)</option>
                                <option value="za" ${sortOption === 'za' ? 'selected' : ''}>Z-A (Athlete)</option>
                                <option value="value_high" ${sortOption === 'value_high' ? 'selected' : ''}>Highest Value</option>
                                <option value="value_low" ${sortOption === 'value_low' ? 'selected' : ''}>Lowest Value</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="overflow-x: auto;">
                        <table class="card-list-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="padding: 0.75rem; text-align: center; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color); width: 40px;"></th>
                                    <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">Card</th>
                                    <th style="padding: 0.75rem; text-align: left; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">Condition</th>
                                    <th style="padding: 0.75rem; text-align: right; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">Cost</th>
                                    <th style="padding: 0.75rem; text-align: right; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">FMV</th>
                                    <th style="padding: 0.75rem; text-align: center; font-weight: 600; color: var(--subtle-text-color); background: var(--background-color); border-bottom: 1px solid var(--border-color);">Status</th>
                                </tr>
                            </thead>
                            <tbody>
            `;
            
            cards.forEach(card => {
                const cost = parseFloat(card.purchase_price) || 0;
                const fmv = parseFloat(card.current_fmv) || 0;
                const cardROI = cost > 0 ? ((fmv - cost) / cost * 100) : 0;
                
                // Check if data is stale
                const lastUpdated = card.last_updated_at ? new Date(card.last_updated_at) : null;
                const isStale = !lastUpdated || lastUpdated < thirtyDaysAgo;
                
                // Build card description
                let cardDesc = '';
                if (card.year) cardDesc += card.year + ' ';
                if (card.set_name) cardDesc += card.set_name + ' ';
                if (card.athlete) cardDesc += card.athlete;
                if (card.card_number) cardDesc += ' #' + card.card_number;
                if (card.variation) cardDesc += ' (' + card.variation + ')';
                
                // Build condition badge
                let conditionBadge = '';
                if (card.grading_company) {
                    const gradeClass = card.grading_company === 'PSA' && card.grade === '10' ? 'psa-10' : '';
                    conditionBadge = `<span class="condition-badge ${gradeClass}" style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem; font-weight: 600; background: ${gradeClass ? 'linear-gradient(135deg, #34c759, #30d158)' : 'linear-gradient(135deg, #6e6e73, #8e8e93)'}; color: white;">
                        ${card.grading_company} ${card.grade || ''}
                    </span>`;
                } else {
                    conditionBadge = `<span class="condition-badge raw" style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem; font-weight: 600; background: linear-gradient(135deg, #6e6e73, #8e8e93); color: white;">Raw</span>`;
                }
                
                // Status indicators
                let statusHTML = '';
                if (card.review_required) {
                    statusHTML += `<span class="review-flag" title="${escapeHtml(card.review_reason || 'Review required')}" style="color: #ff3b30; font-size: 1rem; cursor: help;">⚠️</span> `;
                }
                if (isStale && card.auto_update) {
                    statusHTML += `<span class="stale-warning" title="Data older than 30 days" style="color: #ff9500; font-size: 0.85rem;">⏰</span>`;
                }
                if (!statusHTML) {
                    statusHTML = '<span style="color: #34c759;">✓</span>';
                }
                
                html += `
                    <tr style="border-bottom: 1px solid var(--border-color); transition: background 0.2s ease;" onmouseover="this.style.background='linear-gradient(135deg, #f8fafd 0%, #f0f4ff 100%)'" onmouseout="this.style.background='transparent'">
                        <td style="padding: 0.5rem; text-align: center; width: 50px;">
                            <button
                                onclick="CollectionModule.showCardContextMenu('${card.id}', '${card.binder_id}', event); event.stopPropagation();"
                                class="options-button"
                                style="
                                    background: #f5f5f7;
                                    border: 1px solid #e5e5e7;
                                    border-radius: 12px;
                                    padding: 6px 10px;
                                    cursor: pointer;
                                    transition: all 0.2s ease;
                                    display: inline-flex;
                                    flex-direction: column;
                                    gap: 3px;
                                    align-items: center;
                                    justify-content: center;
                                    min-width: 32px;
                                    min-height: 32px;
                                "
                                onmouseover="
                                    this.style.background='#007aff';
                                    this.style.borderColor='#007aff';
                                    Array.from(this.querySelectorAll('.dot')).forEach(dot => dot.style.background='white');
                                "
                                onmouseout="
                                    this.style.background='#f5f5f7';
                                    this.style.borderColor='#e5e5e7';
                                    Array.from(this.querySelectorAll('.dot')).forEach(dot => dot.style.background='#1d1d1f');
                                "
                                title="Options"
                            >
                                <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                                <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                                <span class="dot" style="width: 4px; height: 4px; background: #1d1d1f; border-radius: 50%; transition: background 0.2s ease;"></span>
                            </button>
                        </td>
                        <td style="padding: 0.75rem;">
                            <div style="font-weight: 600; color: var(--text-color); margin-bottom: 0.25rem;">${escapeHtml(cardDesc || 'Untitled Card')}</div>
                            ${card.tags ? `<div style="font-size: 0.75rem; color: var(--subtle-text-color);">${Array.isArray(card.tags) ? card.tags.map(t => '#' + t).join(' ') : (typeof card.tags === 'string' ? '#' + card.tags : '')}</div>` : ''}
                        </td>
                        <td style="padding: 0.75rem;">${conditionBadge}</td>
                        <td style="padding: 0.75rem; text-align: right; font-weight: 600; color: var(--text-color);">$${cost.toFixed(2)}</td>
                        <td style="padding: 0.75rem; text-align: right;">
                            <div style="font-weight: 600; color: var(--text-color);">$${fmv.toFixed(2)}</div>
                            ${fmv > 0 ? `<div style="font-size: 0.75rem; color: ${cardROI >= 0 ? '#34c759' : '#ff3b30'};">${cardROI >= 0 ? '+' : ''}${cardROI.toFixed(1)}%</div>` : ''}
                        </td>
                        <td style="padding: 0.75rem; text-align: center;">${statusHTML}</td>
                    </tr>
                `;
            });
            
            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }
    
    /**
     * Helper function to escape HTML (prevent XSS)
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Delete a binder and all its cards
     */
    async function deleteBinder(binderId) {
        console.log('[COLLECTION] Deleting binder:', binderId);
        
        if (!confirm('Are you sure you want to delete this binder and all its cards? This action cannot be undone.')) {
            return;
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            // Delete binder (cards will be cascade deleted by database)
            const { error } = await supabase
                .from('binders')
                .delete()
                .eq('id', binderId)
                .eq('user_id', user.id);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Binder deleted successfully');
            
            // Refresh the binder view
            displayBinderView();
            
        } catch (error) {
            console.error('[COLLECTION] Error deleting binder:', error);
            alert('Failed to delete binder: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Delete a card from a binder
     */
    async function deleteCard(cardId, binderId) {
        console.log('[COLLECTION] Deleting card:', cardId);
        
        if (!confirm('Are you sure you want to delete this card? This action cannot be undone.')) {
            return;
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            
            if (!supabase) {
                throw new Error('Database not available');
            }
            
            // Delete card
            const { error } = await supabase
                .from('cards')
                .delete()
                .eq('id', cardId);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Card deleted successfully');
            
            // Refresh the binder detail view
            showBinderDetails(binderId);
            
        } catch (error) {
            console.error('[COLLECTION] Error deleting card:', error);
            alert('Failed to delete card: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Show edit binder modal
     */
    function showEditBinderModal(binderId, binderName) {
        console.log('[COLLECTION] Opening Edit Binder modal for:', binderId);
        
        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.id = 'edit-binder-modal-overlay';
        overlay.className = 'auth-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(8px);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
            animation: fadeIn 0.3s ease;
        `;
        
        const modal = document.createElement('div');
        modal.className = 'auth-modal';
        modal.style.cssText = `
            background: var(--card-background);
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 500px;
            position: relative;
            border: 1px solid var(--border-color);
            animation: scaleIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div class="auth-modal-header" style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--border-color); position: relative; text-align: center;">
                <h2 style="margin: 0; font-size: 1.75rem; font-weight: 700; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                    ✏️ Edit Binder
                </h2>
                <button class="auth-modal-close" onclick="CollectionModule.hideEditBinderModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: transparent; border: none; font-size: 2rem; color: var(--subtle-text-color); cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; padding: 0;">
                    &times;
                </button>
            </div>
            
            <div class="auth-modal-body" style="padding: 2rem;">
                <form id="edit-binder-form">
                    <input type="hidden" id="edit-binder-id" value="${binderId}">
                    
                    <div class="auth-form-group">
                        <label>Binder Name</label>
                        <input type="text" id="edit-binder-name" value="${binderName}" required>
                    </div>
                    
                    <button type="submit" class="auth-submit-btn" style="width: 100%; padding: 1rem; background: var(--gradient-primary); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3); margin-top: 1rem;">
                        💾 Save Changes
                    </button>
                </form>
            </div>
        `;
        
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        
        // Set up form submission
        const form = document.getElementById('edit-binder-form');
        form.addEventListener('submit', handleEditBinder);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideEditBinderModal();
            }
        });
        
        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                hideEditBinderModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    /**
     * Hide edit binder modal
     */
    function hideEditBinderModal() {
        const overlay = document.getElementById('edit-binder-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    }
    
    /**
     * Handle edit binder form submission
     */
    async function handleEditBinder(event) {
        event.preventDefault();
        
        const binderId = document.getElementById('edit-binder-id')?.value;
        const binderName = document.getElementById('edit-binder-name')?.value;
        
        if (!binderName) {
            alert('Please enter a binder name');
            return;
        }
        
        const submitBtn = event.target.querySelector('.auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Saving...';
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            const { error } = await supabase
                .from('binders')
                .update({ name: binderName })
                .eq('id', binderId)
                .eq('user_id', user.id);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Binder updated successfully');
            
            if (submitBtn) {
                submitBtn.textContent = '✅ Saved!';
                submitBtn.style.background = 'linear-gradient(135deg, #34c759, #30d158)';
            }
            
            setTimeout(() => {
                hideEditBinderModal();
                displayBinderView();
            }, 1000);
            
        } catch (error) {
            console.error('[COLLECTION] Error updating binder:', error);
            alert('Failed to update binder: ' + (error.message || 'Unknown error'));
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '💾 Save Changes';
            }
        }
    }
    
    /**
     * Show edit card modal
     */
    async function showEditCardModal(cardId) {
        console.log('[COLLECTION] Opening Edit Card modal for:', cardId);
        
        try {
            const supabase = window.AuthModule.getClient();
            
            if (!supabase) {
                throw new Error('Database not available');
            }
            
            // Fetch card data
            const { data: card, error } = await supabase
                .from('cards')
                .select('*')
                .eq('id', cardId)
                .single();
            
            if (error) {
                throw error;
            }
            
            // Format tags for display
            const tagsValue = Array.isArray(card.tags) ? card.tags.join(', ') : (card.tags || '');
            
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.id = 'edit-card-modal-overlay';
            overlay.className = 'auth-modal-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: flex;
                justify-content: center;
                align-items: center;
                animation: fadeIn 0.3s ease;
                overflow-y: auto;
                padding: 1rem;
            `;
            
            const modal = document.createElement('div');
            modal.className = 'auth-modal';
            modal.style.cssText = `
                background: var(--card-background);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 600px;
                max-height: 90vh;
                overflow-y: auto;
                position: relative;
                border: 1px solid var(--border-color);
                animation: scaleIn 0.3s ease;
            `;
            
            modal.innerHTML = `
                <div class="auth-modal-header" style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--border-color); position: relative; text-align: center;">
                    <h2 style="margin: 0; font-size: 1.75rem; font-weight: 700; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                        ✏️ Edit Card
                    </h2>
                    <button class="auth-modal-close" onclick="CollectionModule.hideEditCardModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: transparent; border: none; font-size: 2rem; color: var(--subtle-text-color); cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; padding: 0;">
                        &times;
                    </button>
                </div>
                
                <div class="auth-modal-body" style="padding: 2rem;">
                    <form id="edit-card-form">
                        <input type="hidden" id="edit-card-id" value="${cardId}">
                        <input type="hidden" id="edit-card-binder-id" value="${card.binder_id}">
                        
                        <!-- Card Identity Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                📋 Card Identity
                            </h3>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Year</label>
                                    <input type="text" id="edit-card-year" value="${card.year || ''}" maxlength="4">
                                </div>
                                
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Card Number</label>
                                    <input type="text" id="edit-card-number" value="${card.card_number || ''}">
                                </div>
                            </div>
                            
                            <div class="auth-form-group">
                                <label>Set</label>
                                <input type="text" id="edit-card-set" value="${card.set_name || ''}">
                            </div>
                            
                            <div class="auth-form-group">
                                <label>Athlete Name</label>
                                <input type="text" id="edit-card-athlete" value="${card.athlete || ''}">
                            </div>
                            
                            <div class="auth-form-group">
                                <label>Variation / Parallel</label>
                                <input type="text" id="edit-card-variation" value="${card.variation || ''}">
                            </div>
                        </div>
                        
                        <!-- Condition Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                💎 Condition
                            </h3>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Grading Company</label>
                                    <select id="edit-card-grading-company" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color);">
                                        <option value="" ${!card.grading_company ? 'selected' : ''}>Raw (Ungraded)</option>
                                        <option value="PSA" ${card.grading_company === 'PSA' ? 'selected' : ''}>PSA</option>
                                        <option value="BGS" ${card.grading_company === 'BGS' ? 'selected' : ''}>BGS (Beckett)</option>
                                        <option value="SGC" ${card.grading_company === 'SGC' ? 'selected' : ''}>SGC</option>
                                        <option value="CGC" ${card.grading_company === 'CGC' ? 'selected' : ''}>CGC</option>
                                        <option value="CSG" ${card.grading_company === 'CSG' ? 'selected' : ''}>CSG</option>
                                        <option value="Other" ${card.grading_company === 'Other' ? 'selected' : ''}>Other</option>
                                    </select>
                                </div>
                                
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Grade</label>
                                    <input type="text" id="edit-card-grade" value="${card.grade || ''}" maxlength="4">
                                </div>
                            </div>
                        </div>
                        
                        <!-- Financial Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                💰 Financial Details
                            </h3>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Purchase Price ($)</label>
                                    <input type="number" id="edit-card-purchase-price" value="${card.purchase_price || ''}" step="0.01" min="0">
                                </div>
                                
                                <div class="auth-form-group" style="margin-bottom: 0;">
                                    <label>Date Purchased</label>
                                    <input type="date" id="edit-card-purchase-date" value="${card.purchase_date || ''}" style="width: 100%; padding: 0.875rem; border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-family: var(--font-family); background: var(--card-background); color: var(--text-color);">
                                </div>
                            </div>
                            
                            <div class="auth-form-group">
                                <label>Current FMV ($)</label>
                                <input type="number" id="edit-card-current-fmv" value="${card.current_fmv || ''}" step="0.01" min="0">
                            </div>
                        </div>
                        
                        <!-- Organization Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                📁 Organization
                            </h3>
                            
                            <div class="auth-form-group">
                                <label>Tags (comma-separated)</label>
                                <input type="text" id="edit-card-tags" value="${tagsValue}">
                            </div>
                        </div>
                        
                        <!-- Search & Automation Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                🔍 Search & Automation
                            </h3>
                            
                            <div class="auth-form-group">
                                <label>Search Query</label>
                                <input type="text" id="editCardSearchQuery" value="${escapeHtml(card.search_query_string || '')}" placeholder="e.g., 2024 Topps Chrome Shohei Ohtani PSA 10">
                                <div style="font-size: 0.75rem; color: var(--subtle-text-color); margin-top: 0.25rem;">
                                    This search query is used to automatically update the card's Fair Market Value. You can refine it if needed (e.g., after grading).
                                </div>
                            </div>
                            
                            <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 1rem;">
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="checkbox" id="edit-card-exclude-lots" ${card.exclude_lots ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                                    <span style="font-weight: 500; color: var(--text-color);">Exclude Lots</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="checkbox" id="edit-card-raw-only" ${card.raw_only ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                                    <span style="font-weight: 500; color: var(--text-color);">Raw Only</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input type="checkbox" id="edit-card-base-only" ${card.base_only ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
                                    <span style="font-weight: 500; color: var(--text-color);">Base Only</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Settings Section -->
                        <div style="margin-bottom: 2rem;">
                            <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; font-weight: 600; color: var(--text-color);">
                                ⚙️ Settings
                            </h3>
                            
                            <div style="background: linear-gradient(135deg, #f5f5f7 0%, #fafafa 100%); padding: 1rem; border-radius: 8px;">
                                <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 500; color: var(--text-color);">
                                    <input type="checkbox" id="edit-card-auto-update" ${card.auto_update ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;">
                                    <div>
                                        <div>Auto-Update Value</div>
                                        <div style="font-size: 0.85rem; font-weight: 400; color: var(--subtle-text-color); margin-top: 0.25rem;">
                                            Automatically update Fair Market Value every 90 days
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        
                        <button type="submit" class="auth-submit-btn" style="width: 100%; padding: 1rem; background: var(--gradient-primary); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3); margin-top: 1rem;">
                            💾 Save Changes
                        </button>
                    </form>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Set up form submission
            const form = document.getElementById('edit-card-form');
            form.addEventListener('submit', handleEditCard);
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    hideEditCardModal();
                }
            });
            
            // Close on Escape key
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    hideEditCardModal();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
            
        } catch (error) {
            console.error('[COLLECTION] Error loading card for edit:', error);
            alert('Failed to load card: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Hide edit card modal
     */
    function hideEditCardModal() {
        const overlay = document.getElementById('edit-card-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    }
    
    /**
     * Handle edit card form submission
     */
    async function handleEditCard(event) {
        event.preventDefault();
        
        const cardId = document.getElementById('edit-card-id')?.value;
        const binderId = document.getElementById('edit-card-binder-id')?.value;
        
        const cardData = {
            year: document.getElementById('edit-card-year')?.value || null,
            set_name: document.getElementById('edit-card-set')?.value || null,
            athlete: document.getElementById('edit-card-athlete')?.value || null,
            card_number: document.getElementById('edit-card-number')?.value || null,
            variation: document.getElementById('edit-card-variation')?.value || null,
            grading_company: document.getElementById('edit-card-grading-company')?.value || null,
            grade: document.getElementById('edit-card-grade')?.value || null,
            purchase_price: parseFloat(document.getElementById('edit-card-purchase-price')?.value) || null,
            purchase_date: document.getElementById('edit-card-purchase-date')?.value || null,
            current_fmv: parseFloat(document.getElementById('edit-card-current-fmv')?.value) || null,
            search_query_string: document.getElementById('editCardSearchQuery')?.value.trim() || '',
            exclude_lots: document.getElementById('edit-card-exclude-lots')?.checked || false,
            raw_only: document.getElementById('edit-card-raw-only')?.checked || false,
            base_only: document.getElementById('edit-card-base-only')?.checked || false,
            tags: document.getElementById('edit-card-tags')?.value ?
                  document.getElementById('edit-card-tags').value.split(',').map(t => t.trim()) : [],
            auto_update: document.getElementById('edit-card-auto-update')?.checked || false
        };
        
        const submitBtn = event.target.querySelector('.auth-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '⏳ Saving...';
        }
        
        try {
            const supabase = window.AuthModule.getClient();
            
            if (!supabase) {
                throw new Error('Database not available');
            }
            
            // Fetch the old card data to compare current_fmv
            const { data: oldCard, error: fetchError } = await supabase
                .from('cards')
                .select('current_fmv')
                .eq('id', cardId)
                .single();
            
            if (fetchError) {
                console.warn('[COLLECTION] Could not fetch old card data for price history comparison:', fetchError);
            }
            
            const { error } = await supabase
                .from('cards')
                .update(cardData)
                .eq('id', cardId);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Card updated successfully');
            
            // Create price history entry if current_fmv was changed and is valid
            const oldFmv = oldCard ? parseFloat(oldCard.current_fmv) : null;
            const newFmv = cardData.current_fmv;
            
            if (newFmv && newFmv > 0 && oldFmv !== newFmv) {
                console.log('[COLLECTION] Current FMV changed from', oldFmv, 'to', newFmv, '- creating price history entry...');
                
                const { error: historyError } = await supabase
                    .from('price_history')
                    .insert([{
                        card_id: cardId,
                        value: newFmv,
                        num_sales: null,
                        confidence: 'user_provided'
                    }]);
                
                if (historyError) {
                    console.error('[COLLECTION] Error creating price history:', historyError);
                    // Don't fail the entire save - price history is supplementary
                } else {
                    console.log('[COLLECTION] Price history entry created successfully');
                }
            }
            
            if (submitBtn) {
                submitBtn.textContent = '✅ Saved!';
                submitBtn.style.background = 'linear-gradient(135deg, #34c759, #30d158)';
            }
            
            setTimeout(() => {
                hideEditCardModal();
                showBinderDetails(binderId);
            }, 1000);
            
        } catch (error) {
            console.error('[COLLECTION] Error updating card:', error);
            alert('Failed to update card: ' + (error.message || 'Unknown error'));
            
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '💾 Save Changes';
            }
        }
    }
    
    /**
     * Show context menu for binder
     */
    function showBinderContextMenu(binderId, binderName, event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Remove any existing context menu
        closeContextMenu();
        
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            z-index: 10001;
            min-width: 150px;
            overflow: hidden;
            animation: scaleIn 0.15s ease;
        `;
        
        menu.innerHTML = `
            <div class="context-menu-item" onclick="CollectionModule.showEditBinderModal('${binderId}', '${binderName.replace(/'/g, "\\'")}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem;" onmouseover="this.style.background='linear-gradient(135deg, #f0f4ff 0%, #e6f0ff 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">✏️</span>
                <span>Edit</span>
            </div>
            <div class="context-menu-item" onclick="CollectionModule.deleteBinder('${binderId}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem; color: #ff3b30;" onmouseover="this.style.background='linear-gradient(135deg, #fff0f0 0%, #ffe6e6 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">🗑️</span>
                <span>Delete</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Position the menu near the clicked button
        const rect = event.target.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        
        let left = rect.right + 5;
        let top = rect.top;
        
        // Adjust if menu goes off screen
        if (left + menuRect.width > window.innerWidth) {
            left = rect.left - menuRect.width - 5;
        }
        if (top + menuRect.height > window.innerHeight) {
            top = window.innerHeight - menuRect.height - 10;
        }
        
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeContextMenu);
        }, 0);
    }
    
    /**
     * Show context menu for card
     */
    function showCardContextMenu(cardId, binderId, event) {
        event.preventDefault();
        event.stopPropagation();
        
        // Remove any existing context menu
        closeContextMenu();
        
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.style.cssText = `
            position: fixed;
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            z-index: 10001;
            min-width: 150px;
            overflow: hidden;
            animation: scaleIn 0.15s ease;
        `;
        
        menu.innerHTML = `
            <div class="context-menu-item" onclick="CollectionModule.showEditCardModal('${cardId}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem;" onmouseover="this.style.background='linear-gradient(135deg, #f0f4ff 0%, #e6f0ff 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">✏️</span>
                <span>Edit</span>
            </div>
            <div class="context-menu-item" onclick="CollectionModule.showMoveCardModal('${cardId}', '${binderId}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem;" onmouseover="this.style.background='linear-gradient(135deg, #f0f4ff 0%, #e6f0ff 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">📁</span>
                <span>Move</span>
            </div>
            <div class="context-menu-item" onclick="CollectionModule.deleteCard('${cardId}', '${binderId}'); CollectionModule.closeContextMenu();" style="padding: 0.75rem 1rem; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: background 0.2s; font-size: 0.95rem; color: #ff3b30;" onmouseover="this.style.background='linear-gradient(135deg, #fff0f0 0%, #ffe6e6 100%)'" onmouseout="this.style.background='transparent'">
                <span style="font-size: 1rem;">🗑️</span>
                <span>Delete</span>
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Position the menu near the clicked button
        const rect = event.target.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        
        let left = rect.right + 5;
        let top = rect.top;
        
        // Adjust if menu goes off screen
        if (left + menuRect.width > window.innerWidth) {
            left = rect.left - menuRect.width - 5;
        }
        if (top + menuRect.height > window.innerHeight) {
            top = window.innerHeight - menuRect.height - 10;
        }
        
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeContextMenu);
        }, 0);
    }
    
    /**
     * Close context menu
     */
    function closeContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) {
            menu.remove();
        }
        document.removeEventListener('click', closeContextMenu);
    }
    
    /**
     * Show move card modal
     */
    async function showMoveCardModal(cardId, currentBinderId) {
        console.log('[COLLECTION] Opening Move Card modal for:', cardId);
        
        try {
            const supabase = window.AuthModule.getClient();
            const user = window.AuthModule.getCurrentUser();
            
            if (!supabase || !user) {
                throw new Error('Authentication error');
            }
            
            // Fetch all user's binders
            const { data: binders, error: bindersError } = await supabase
                .from('binders')
                .select('id, name')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            
            if (bindersError) {
                throw bindersError;
            }
            
            // Filter out current binder
            const otherBinders = binders.filter(b => b.id !== currentBinderId);
            
            // Create modal overlay
            const overlay = document.createElement('div');
            overlay.id = 'move-card-modal-overlay';
            overlay.className = 'auth-modal-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);
                z-index: 10000;
                display: flex;
                justify-content: center;
                align-items: center;
                animation: fadeIn 0.3s ease;
            `;
            
            const modal = document.createElement('div');
            modal.className = 'auth-modal';
            modal.style.cssText = `
                background: var(--card-background);
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                width: 90%;
                max-width: 500px;
                position: relative;
                border: 1px solid var(--border-color);
                animation: scaleIn 0.3s ease;
            `;
            
            let binderOptions = '';
            if (otherBinders.length > 0) {
                binderOptions = otherBinders.map(b =>
                    `<div class="binder-option" onclick="CollectionModule.handleMoveCard('${cardId}', '${b.id}', '${currentBinderId}')" style="padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s; margin-bottom: 0.75rem;" onmouseover="this.style.background='linear-gradient(135deg, #f0f4ff 0%, #e6f0ff 100%)'; this.style.borderColor='#007aff';" onmouseout="this.style.background='transparent'; this.style.borderColor='var(--border-color)'">
                        <div style="font-weight: 600; color: var(--text-color);">📁 ${escapeHtml(b.name)}</div>
                    </div>`
                ).join('');
            } else {
                binderOptions = `<div style="text-align: center; padding: 2rem; color: var(--subtle-text-color);">No other binders available</div>`;
            }
            
            modal.innerHTML = `
                <div class="auth-modal-header" style="padding: 2rem 2rem 1rem 2rem; border-bottom: 1px solid var(--border-color); position: relative; text-align: center;">
                    <h2 style="margin: 0; font-size: 1.75rem; font-weight: 700; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                        📁 Move Card to Binder
                    </h2>
                    <button class="auth-modal-close" onclick="CollectionModule.hideMoveCardModal()" style="position: absolute; top: 1.5rem; right: 1.5rem; background: transparent; border: none; font-size: 2rem; color: var(--subtle-text-color); cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.3s ease; padding: 0;">
                        &times;
                    </button>
                </div>
                
                <div class="auth-modal-body" style="padding: 2rem;">
                    <div style="margin-bottom: 1.5rem;">
                        <h3 style="margin: 0 0 1rem 0; font-size: 1rem; font-weight: 600; color: var(--text-color);">Select Destination Binder:</h3>
                        ${binderOptions}
                    </div>
                    
                    <div style="border-top: 1px solid var(--border-color); padding-top: 1.5rem;">
                        <div class="binder-option" onclick="CollectionModule.showCreateBinderForMove('${cardId}', '${currentBinderId}')" style="padding: 1rem; border: 2px dashed var(--border-color); border-radius: 8px; cursor: pointer; transition: all 0.2s; text-align: center;" onmouseover="this.style.background='linear-gradient(135deg, #f0fff4 0%, #e6ffe6 100%)'; this.style.borderColor='#34c759';" onmouseout="this.style.background='transparent'; this.style.borderColor='var(--border-color)'">
                            <div style="font-weight: 600; color: #34c759;">+ Create New Binder</div>
                        </div>
                    </div>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // Close on overlay click
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    hideMoveCardModal();
                }
            });
            
            // Close on Escape key
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    hideMoveCardModal();
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
            
        } catch (error) {
            console.error('[COLLECTION] Error showing move card modal:', error);
            alert('Failed to load binders: ' + (error.message || 'Unknown error'));
        }
    }
    
    /**
     * Hide move card modal
     */
    function hideMoveCardModal() {
        const overlay = document.getElementById('move-card-modal-overlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.2s ease';
            setTimeout(() => overlay.remove(), 200);
        }
    }
    
    /**
     * Show create binder input for move operation
     */
    function showCreateBinderForMove(cardId, currentBinderId) {
        const modalBody = document.querySelector('#move-card-modal-overlay .auth-modal-body');
        if (!modalBody) return;
        
        modalBody.innerHTML = `
            <form id="create-binder-for-move-form">
                <div class="auth-form-group">
                    <label>New Binder Name</label>
                    <input type="text" id="new-binder-name-for-move" placeholder="e.g., Rookie Cards 2024" required autofocus>
                </div>
                
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button type="button" onclick="CollectionModule.showMoveCardModal('${cardId}', '${currentBinderId}')" style="flex: 1; padding: 0.875rem; background: var(--background-color); color: var(--text-color); border: 1px solid var(--border-color); border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                        Cancel
                    </button>
                    <button type="submit" class="auth-submit-btn" style="flex: 1; padding: 0.875rem; background: var(--gradient-primary); color: white; border: none; border-radius: 10px; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);">
                        Create & Move
                    </button>
                </div>
            </form>
        `;
        
        const form = document.getElementById('create-binder-for-move-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const binderName = document.getElementById('new-binder-name-for-move')?.value;
            if (!binderName) return;
            
            const submitBtn = form.querySelector('.auth-submit-btn');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '⏳ Creating...';
            }
            
            try {
                const supabase = window.AuthModule.getClient();
                const user = window.AuthModule.getCurrentUser();
                
                if (!supabase || !user) {
                    throw new Error('Authentication error');
                }
                
                // Create new binder
                const { data: binderData, error: binderError } = await supabase
                    .from('binders')
                    .insert([{
                        user_id: user.id,
                        name: binderName
                    }])
                    .select()
                    .single();
                
                if (binderError) {
                    throw binderError;
                }
                
                // Move card to new binder
                await handleMoveCard(cardId, binderData.id, currentBinderId);
                
            } catch (error) {
                console.error('[COLLECTION] Error creating binder:', error);
                alert('Failed to create binder: ' + (error.message || 'Unknown error'));
                
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create & Move';
                }
            }
        });
    }
    
    /**
     * Handle moving a card to a different binder
     */
    async function handleMoveCard(cardId, newBinderId, currentBinderId) {
        console.log('[COLLECTION] Moving card', cardId, 'to binder', newBinderId);
        
        try {
            const supabase = window.AuthModule.getClient();
            
            if (!supabase) {
                throw new Error('Database not available');
            }
            
            // Update card's binder_id (user_id remains unchanged - same user)
            const { error } = await supabase
                .from('cards')
                .update({ binder_id: newBinderId })
                .eq('id', cardId);
            
            if (error) {
                throw error;
            }
            
            console.log('[COLLECTION] Card moved successfully');
            
            // Close modal
            hideMoveCardModal();
            
            // Refresh the current binder view
            showBinderDetails(currentBinderId);
            
        } catch (error) {
            console.error('[COLLECTION] Error moving card:', error);
            alert('Failed to move card: ' + (error.message || 'Unknown error'));
        }
    }
    
    // Public API
    return {
        showAddToCollectionModal,
        hideAddToCollectionModal,
        parseSearchString,
        displayBinderView,
        showBinderDetails,
        deleteBinder,
        deleteCard,
        showEditBinderModal,
        hideEditBinderModal,
        showEditCardModal,
        hideEditCardModal,
        showBinderContextMenu,
        showCardContextMenu,
        closeContextMenu,
        showMoveCardModal,
        hideMoveCardModal,
        showCreateBinderForMove,
        handleMoveCard,
        sortBindersView,
        sortCardsView
    };
})();

// Expose CollectionModule globally
window.CollectionModule = CollectionModule;
