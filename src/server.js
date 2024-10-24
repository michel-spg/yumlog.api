const express = require("express");
const recipes = require("./temp-data.json");
const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.send("Welcome to Yumlog!");
});

app.get("/recipes", (req, res) => {
  res.json(recipes);
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
