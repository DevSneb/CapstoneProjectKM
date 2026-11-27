<template>
  <div>
    <h2>Orders • On The Way</h2>
    <orders-list status="on_the_way"/>
  </div>
</template>
<script>
import OrdersList from './_OrdersList.vue'
export default { components:{ OrdersList } }
</script>
