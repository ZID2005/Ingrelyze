
import { parseFoodInput, findBestMatch } from './frontend/src/utils/nlpParser.js';

// Mock DB
const mockDB = [
    { food: "Pizza", caloric_value: 266 },
    { food: "French Fries", caloric_value: 312 },
    { food: "Chicken Sandwich", caloric_value: 250 },
    { food: "Coke", caloric_value: 140 },
    { food: "Milk", caloric_value: 42 }
];

const tests = [
    "I ate 2 pizzas",
    "Had 1 chicken sandwich and 3 fries",
    "Drank 2 cups of milk"
];

console.log("--- Testing NLP Parser ---");

tests.forEach(text => {
    console.log(`\nInput: "${text}"`);
    const parsed = parseFoodInput(text);
    console.log("Parsed:", JSON.stringify(parsed, null, 2));

    parsed.forEach(item => {
        // Simulate Search (naive filter)
        // In real app, we query backend. Here we filter mockDB by some inclusion or just pass all
        const candidates = mockDB;

        const best = findBestMatch(item.food, candidates);
        if (best) {
            console.log(`Matched "${item.food}" -> "${best.food}"`);
            const totalCals = best.caloric_value * item.quantity;
            console.log(`Calculation: ${best.caloric_value} * ${item.quantity} = ${totalCals} kcal`);
        } else {
            console.log(`No match found for "${item.food}"`);
        }
    });
});
