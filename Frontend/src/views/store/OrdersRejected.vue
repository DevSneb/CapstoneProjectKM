<template>
  <div>
    <h2>Orders • Rejected</h2>
    <orders-list status="rejected"/>
  </div>
</template>
<script>
import OrdersList from './_OrdersList.vue'
export default { components:{ OrdersList } }
</script>
