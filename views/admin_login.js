<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <title>Admin Login</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <h1>Админ – Вход</h1>
    <% if (error) { %><p style="color:#ff6b6b"><%= error %></p><% } %>
    <form method="POST" action="/admin/login">
      <label>Потребител</label>
      <input name="username" placeholder="admin">
      <label>Парола</label>
      <input type="password" name="password" placeholder="admin123">
      <button type="submit">Вход</button>
    </form>
    <p class="note">Seed по подразбиране: admin / admin123 (смени след вход)</p>
  </div>
</body>
</html>