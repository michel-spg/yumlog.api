const express = require("express");
const path = require("path");
const mariadb = require("mariadb");
const cors = require("cors");

const app = express();
const port = 3000;

// http://localhost:3000/images/spaghetti-bolognese.jpeg
// Statische Dateien (Bilder) bereitstellen, damit sie über die URL /images erreichbar sind
app.use("/images", express.static(path.join(__dirname, "../assets")));
app.use(cors());

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

app.get("/api/recipes/:id", async (req, res) => {
  const recipeId = req.params.id;

  try {
    const connection = await pool.getConnection();

    // SQL-Abfrage, um das Rezept basierend auf der ID zu erhalten
    const recipeRows = await connection.query(
      `
      SELECT 
        id AS recipe_id,
        title,
        description,
        duration,
        imageUrl,
        instructions
      FROM 
        recipes
      WHERE 
        id = ?
      `,
      [recipeId]
    );

    // Überprüfen, ob das Rezept existiert
    if (recipeRows.length === 0) {
      res.status(404).json({ message: "Recipe not found" });
      return;
    }

    const recipe = recipeRows[0];

    // SQL-Abfrage, um die Zutaten für das Rezept zu erhalten
    const ingredientRows = await connection.query(
      `
      SELECT 
        id AS ingredient_id,
        name AS ingredient_name,
        amount AS ingredient_amount
      FROM 
        ingredients
      WHERE 
        recipe_id = ?
      `,
      [recipeId]
    );

    // Rezept mit seinen Zutaten strukturieren
    const recipeWithIngredients = {
      id: recipe.recipe_id,
      title: recipe.title,
      description: recipe.description,
      duration: recipe.duration,
      imageUrl: recipe.imageUrl,
      instructions: recipe.instructions,
      ingredients: ingredientRows.map((ingredient) => ({
        id: ingredient.ingredient_id,
        name: ingredient.ingredient_name,
        amount: ingredient.ingredient_amount,
      })),
    };

    res.json(recipeWithIngredients);
    connection.release();
  } catch (error) {
    console.error("Error fetching recipe:", error);
    res.status(500).json({ message: "Error fetching recipe" });
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
