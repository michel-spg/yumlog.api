const express = require("express");
const path = require("path");
const mariadb = require("mariadb");
const cors = require("cors");
const multer = require("multer");
const admin = require("firebase-admin");

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

// Initialize Firebase Admin SDK
const serviceAccount = require("../config/serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware to verify Firebase token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    console.log("Decoded token:", req.user);
    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(403).json({ message: "Unauthorized: Invalid token" });
  }
};

// Set up the storage destination and file naming
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "assets"); // specify the destination folder
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with the original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`
    );
  },
});

const upload = multer({ storage });

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

    // console.log(recipeRows);

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

// POST-Endpoint für /api/recipes - Rezept erstellen
app.post("/api/recipes", verifyToken, upload.single("image"), async (req, res) => {
  try {
    // Parse the formData fields
    const { title, description, duration, instructions, ingredients } =
      req.body;

    console.log("Request body:", req.body);

    // Handle the uploaded image file (optional)
    const imageUrl = req.file ? `/images/${req.file.filename}` : null;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    // Insert recipe into the `recipes` table
    const recipeResult = await connection.query(
      `
      INSERT INTO recipes (title, description, duration, imageUrl, instructions)
      VALUES (?, ?, ?, ?, ?)
      `,
      [title, description, duration, imageUrl, instructions]
    );

    console.log("Inserted recipe result:", recipeResult);
    const recipeId = Number(recipeResult.insertId);
    console.log("Inserted recipe ID:", recipeId);

    // Insert ingredients into the `ingredients` table
    if (ingredients && ingredients.length > 0) {
      const ingredientValues = ingredients.map((ingredient) => [
        recipeId,
        ingredient.name,
        ingredient.amount,
      ]);

      const placeholders = ingredientValues.map(() => "(?, ?, ?)").join(", ");
      const flattenedValues = ingredientValues.flat();
      console.log(flattenedValues);

      await connection.query(
        `
        INSERT INTO ingredients (recipe_id, name, amount)
        VALUES ${placeholders}
        `,
        flattenedValues
      );
    }

    await connection.commit();

    res.status(201).json({ message: "Recipe created successfully", recipeId });
    connection.release();
  } catch (error) {
    console.error("Error creating recipe:", error);
    res.status(500).json({ message: "Error creating recipe" });

    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Error rolling back transaction:", rollbackError);
    }
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
