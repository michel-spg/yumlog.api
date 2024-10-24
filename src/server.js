const express = require("express");
const path = require("path");
const mariadb = require("mariadb");

const app = express();
const port = 3000;

 // Statische Dateien (Bilder) bereitstellen, damit sie über die URL /images erreichbar sind 
 app.use("/images", express.static(path.join(__dirname, "../assets"))); 

const pool = mariadb.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "recipes_db", // Datenbankname
});

app.get("/api/recipes", async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Erste SQL-Abfrage, um alle Rezepte zu erhalten
    const recipeRows = await connection.query(`
      SELECT 
        id AS recipe_id,
        title,
        description,
        duration,
        imageUrl,
        instructions
      FROM 
        recipes
    `);

    // Zweite SQL-Abfrage, um alle Zutaten für die Rezepte zu erhalten
    const ingredientRows = await connection.query(`
      SELECT 
        id AS ingredient_id,
        recipe_id,
        name AS ingredient_name,
        amount AS ingredient_amount
      FROM 
        ingredients
    `);

    // Rezepte strukturieren
    const recipes = recipeRows.map((recipe) => {
      // Finde die zugehörigen Zutaten für das aktuelle Rezept
      const ingredients = ingredientRows
        .filter((ingredient) => ingredient.recipe_id === recipe.recipe_id)
        .map((ingredient) => ({
          id: ingredient.ingredient_id,
          name: ingredient.ingredient_name,
          amount: ingredient.ingredient_amount,
        }));

      return {
        id: recipe.recipe_id,
        title: recipe.title,
        description: recipe.description,
        duration: recipe.duration,
        imageUrl: recipe.imageUrl,
        instructions: recipe.instructions,
        ingredients: ingredients,
      };
    });

    res.json(recipes);
    connection.release();
  } catch (error) {
    console.error("Error fetching recipes:", error);
    res.status(500).json({ message: "Error fetching recipes" });
  }
});

app.get("/recipes/:id", (req, res) => {
  const recipe = recipes.find((recipe) => recipe.id === req.params.id);
  if (recipe) {
    res.json(recipe);
  } else {
    res.status(404).send("Recipe not found");
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
