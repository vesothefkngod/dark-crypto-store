<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <title><%= product.name %></title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <a href="/">← Назад</a>
    <h1><%= product.name %></h1>
    <img src="<%= product.image %>" alt="" style="width:100%;max-width:560px;border-radius:8px;border:1px solid #222">
    <p><%= product.description %></p>
    <p class="price">Цена: <%= product.price.toFixed(2) %> лв.</p>
    <form method="POST" action="/checkout/<%= product.id %>">
      <label>Имейл (по избор)</label>
      <input type="email" name="email" placeholder="you@domain.com">
      <button type="submit">Купи сега</button>
    </form>
  </div>
</body>
</html>