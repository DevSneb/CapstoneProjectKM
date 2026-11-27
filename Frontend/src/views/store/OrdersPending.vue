<template>
  <div>
    <h2>Orders • Pending</h2>
    <orders-list status="pending" editable/>
  </div>
</template>
<script>
import OrdersList from './_OrdersList.vue'
export default { components:{ OrdersList } }
</script>
