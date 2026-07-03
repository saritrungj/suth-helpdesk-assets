<script setup>
const emit = defineEmits(['search'])

function onSearch(e) {
  emit('search', e.target.value)
}
</script>

<template>
  <input
    type="text"
    placeholder="ค้นหา SN..."
    class="border px-3 py-2 rounded w-80"
    @input="onSearch"
  />
</template>