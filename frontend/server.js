const express = require("express");
const path    = require("path");
const app     = express();
const PORT    = process.env.PORT || 3000;

// Servir archivos estáticos del build de Vite
app.use(express.static(path.join(__dirname, "dist")));

// SPA fallback — todas las rutas van al index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`DocuColab frontend corriendo en puerto ${PORT}`);
});
