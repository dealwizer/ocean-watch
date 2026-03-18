const express = require('express');
const mongoose = require('mongoose');
const app = express();
const PORT = 3000;

// Подключение к MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/oceanDB')
  .then(() => console.log('✅ Успешное подключение к MongoDB'))
  .catch(err => console.error('❌ Ошибка подключения:', err));

app.use(express.static('public')); // Папка для вашего HTML/CSS/JS

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});