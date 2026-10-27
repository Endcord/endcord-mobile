/*
 * Endcord for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { t, tx } from "@core/i18n";

import { definePlugin, ENDCORD_AUTHOR } from "../api";
import { answer, clip, enc, json, only } from "../shared/utility";

export default definePlugin({
    id: "endcord.recipe-finder",
    name: "RecipeFinder",
    description: tx("Find a recipe for a dish with /recipe"),
    authors: [ENDCORD_AUTHOR],
    icon: "BookCheckIcon",
    tags: ["Utility", "Fun"],
    start: only({
        name: "recipe",
        description: tx("A recipe for a dish"),
        options: [{ name: "dish", description: tx("The dish, in English"), required: true }],
        run: async ({ dish }, ctx) => {
            const meal = (await json(`https://www.themealdb.com/api/json/v1/1/search.php?s=${enc(String(dish).trim())}`))?.meals?.[0];
            if (!meal) return answer(ctx, t("No recipe for {dish} was found.", { dish }));
            const ingredients = Array.from({ length: 20 }, (_, i) => [meal[`strMeasure${i + 1}`], meal[`strIngredient${i + 1}`]])
                .filter(([, ingredient]) => ingredient?.trim())
                .map(([measure, ingredient]) => `• ${`${measure ?? ""} ${ingredient}`.trim()}`);
            answer(ctx, [
                `**${meal.strMeal}** · ${[meal.strArea, meal.strCategory].filter(Boolean).join(" · ")}`,
                ingredients.join("\n"),
                clip(String(meal.strInstructions ?? ""), 700),
                meal.strSource || meal.strYoutube,
            ].filter(Boolean).join("\n"));
        },
    }),
});
