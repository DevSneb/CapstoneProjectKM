<template>
  <div>
    <h2>Orders • All</h2>
    <orders-list editable />
  </div>
</template>
<script>
import OrdersList from './_OrdersList.vue'
export default { components:{ OrdersList } }
</script>
<style scoped>
.toolbar{margin-bottom:10px}
.table{width:100%;background:#fff;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #eee}
.empty{text-align:center;color:#999}
</style>
