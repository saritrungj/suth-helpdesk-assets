<script setup>
defineProps({
  assets: Array
})

const emit = defineEmits(['delete'])

function onDelete(id) {
  emit('delete', id)
}
</script>

<template>
  <table class="w-full border mt-4">
    <thead class="bg-gray-100">
      <tr>
        <th class="border p-2">SN</th>
        <th class="border p-2">Brand</th>
        <th class="border p-2">Model</th>
        <th class="border p-2">Department</th>
        <th class="border p-2">Status</th>
        <th class="border p-2">Action</th>
      </tr>
    </thead>

    <tbody>
      <tr v-for="a in assets" :key="a.id">
        <td class="border p-2">{{ a.sn }}</td>
        <td class="border p-2">{{ a.brand }}</td>
        <td class="border p-2">{{ a.model }}</td>
        <td class="border p-2">{{ a.department }}</td>
        <td class="border p-2">{{ a.status }}</td>

        <td class="border p-2">
          <button class="bg-red-600 text-white px-2 py-1 rounded"
                  @click="onDelete(a.id)">
            ลบ
          </button>
        </td>
      </tr>
    </tbody>
  </table>
</template>