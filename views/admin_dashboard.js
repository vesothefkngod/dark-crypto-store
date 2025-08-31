<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <title>Admin Dashboard</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <div class="topbar">
      <h1>Админ – Табло</h1>
      <div>Здравей, <b><%= admin.username %></b> | <a href="/admin/logout">Изход</a></div>
    </div>

    <h2>Добави продукт</h2>
    <form method="POST" action="/admin/product/add">
      <label>Име</label><input name="name" required>
      <label>Описание</label><textarea name="description"></textarea>
      <label>Цена</label><input name="price" type="number" step="0.01" required>
      <label>Image URL</label><input name="image" placeholder="https://...">
      <button type="submit">Запази</button>
    </form>

    <h2>Продукти</h2>
    <table class="table">
      <tr><th>ID</th><th>Име</th><th>Цена</th><th></th></tr>
      <% products.forEach(p => { %>
        <tr>
          <td><%= p.id %></td>
          <td><%= p.name %></td>
          <td><%= p.price.toFixed(2) %></td>
          <td>
            <form method="POST" action="/admin/product/delete/<%= p.id %>" onsubmit="return confirm('Да изтрия ли продукта?')">
              <button type="submit">Изтрий</button>
            </form>
          </td>
        </tr>
      <% }) %>
    </table>

    <h2>Поръчки</h2>
    <table class="table">
      <tr><th>ID</th><th>Продукт</th><th>Цена</th><th>Статус</th><th>Създадена</th></tr>
      <% orders.forEach(o => { %>
        <tr>
          <td><%= o.id %></td>
          <td><%= o.product_name %></td>
          <td><%= o.price.toFixed(2) %></td>
          <td><%= o.status %></td>
          <td><%= o.created_at %></td>
        </tr>
      <% }) %>
    </table>
  </div>
</body>
</html>