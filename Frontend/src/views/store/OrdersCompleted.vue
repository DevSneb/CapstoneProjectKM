<template>
  <div>
    <h2>Orders • Delivered</h2>
    <orders-list status="delivered"/>
  </div>
</template>
<script>
import OrdersList from './_OrdersList.vue'
export default { components:{ OrdersList } }
</script>
