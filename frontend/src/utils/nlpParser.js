// Improved NLP Parsing Logic
export const parseFoodInput = (text) => {
    if (!text) return [];

    // 1. Remove common conversational prefixes
    // "I have eaten", "I ate", "I had", "Today I had", "Today I ate"
    // Also handles "I want to add", "Add", etc. if needed, but focus on consumption for now.
    let cleanText = text.replace(/(?:^|\s+)(?:I\s+(?:have\s+)?(?:eaten|had|ate)|Today\s+I\s+(?:have\s+)?(?:eaten|had|ate))\s+/gi, ' ');

    // 2. Split by separators
    const rawSegments = cleanText.split(/,| and | & |\n/i);
    const parsedItems = [];

    // 3. Regex for Quantity + Unit + Food
    // ^\s*                     : Start of string, optional space
    // (?:(\d+|an?|one)\s+)?    : Optional Quantity (Group 1) - digit or words
    // (?:(cup|slice|piece|bowl|glass|plate|gram|g|oz|ml|l)s?\s+(?:of\s+)?)? : Optional Unit (Group 2)
    // (.+?)                    : Food Name (Group 3) - lazy match
    // (?:\s+|s|es)?\s*$        : Optional trailing 's' or 'es' or spaces (Handled by manual singularization)

    // We use a slightly looser regex to capture "chicken" even without quantity
    const itemRegex = /^(?:(\d+|an?|one)\s+)?(?:(cup|slice|piece|bowl|glass|plate|gram|g|oz|ml|l)s?\s+(?:of\s+)?)?(.+?)$/i;

    // Helper to convert word quantity to number
    const parseQty = (q) => {
        if (!q) return 1;
        const lower = q.toString().toLowerCase();
        if (['a', 'an', 'one'].includes(lower)) return 1;
        return parseFloat(lower) || 1;
    };

    rawSegments.forEach(segment => {
        let trimmed = segment.trim();
        if (!trimmed) return;

        // Clean up trailing punctuation often found in sentences
        trimmed = trimmed.replace(/[.!?]+$/, '');

        const match = trimmed.match(itemRegex);
        if (match) {
            const rawQty = match[1];
            // const unit = match[2]; // Captured but not used yet
            let rawFood = match[3];

            if (rawFood && rawFood.trim().length > 1) {
                // Heuristic Singularization
                const lowerFood = rawFood.toLowerCase();
                // Words to keep as is (uncountable or already handled by search)
                const keepAsIs = ['fries', 'chips', 'oats', 'beans', 'lentils', 'molasses', 'hummus', 'asparagus', 'rice', 'corn', 'pasta'];

                // If it ends in 's' and not 'ss' (glass) and not in exception list
                if (!keepAsIs.some(k => lowerFood.includes(k))) {
                    if (lowerFood.endsWith('s') && !lowerFood.endsWith('ss')) {
                        // Simple check for 'es' vs 's'
                        if (lowerFood.endsWith('oes')) { // potatoes -> potato
                            rawFood = rawFood.slice(0, -2);
                        } else if (lowerFood.endsWith('ches') || lowerFood.endsWith('shes')) { // peaches, dishes
                            rawFood = rawFood.slice(0, -2);
                        } else if (lowerFood.endsWith('ies')) { // berries -> berry
                            rawFood = rawFood.slice(0, -3) + 'y';
                        } else {
                            // Default strip 's' (apples -> apple, pizzas -> pizza)
                            rawFood = rawFood.slice(0, -1);
                        }
                    }
                }

                // Special handling for 'fries' which might be captured as 'fri' due to 'es' optional in old logic,
                // but here we are explicit. If we stripped properly, 'fries' -> 'fri' if logic failed.
                // But we have keepAsIs for 'fries'.

                parsedItems.push({
                    original: segment.trim(),
                    quantity: parseQty(rawQty),
                    food: rawFood.trim()
                });
            }
        }
    });

    return parsedItems;
};

// Calculate Levenshtein Distance
const levenshteinDistance = (a, b) => {
    const matrix = [];
    let i, j;

    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
};

// Find the best match from a list of candidates
export const findBestMatch = (query, candidates) => {
    if (!candidates || candidates.length === 0) return null;

    let bestMatch = null;
    let minDistance = Infinity;

    // Normalize query
    const lowerQuery = query.toLowerCase().trim();

    candidates.forEach(candidate => {
        const candidateName = candidate.food.toLowerCase();
        const dist = levenshteinDistance(lowerQuery, candidateName);

        // Simple heuristic: if exact substring match, boost score (lower distance)
        let adjustedDist = dist;
        if (candidateName.includes(lowerQuery)) {
            adjustedDist -= 2;
        }

        if (adjustedDist < minDistance) {
            minDistance = adjustedDist;
            bestMatch = candidate;
        }
    });

    // Threshold: If distance is too high relative to string length, maybe no match?
    // For now, consistent with user request, we return the best one if found.
    // We can add a max distance check if needed.
    return bestMatch;
};
