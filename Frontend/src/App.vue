<template>
  <div id="app">
    <router-view/>
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  overflow-x: hidden;
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: #f5f5f5;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

button,
a,
[role="button"],
input,
select,
textarea {
  touch-action: manipulation;
  -webkit-tap-highlight-color: rgba(78, 125, 50, 0.12);
}

#app {
  min-height: 100vh;
  min-height: 100dvh;
  max-width: 100vw;
}

@media (max-width: 900px) {
  input,
  select,
  textarea {
    font-size: 16px;
  }
}
</style>
