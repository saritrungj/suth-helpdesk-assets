<script setup>
defineProps({
  assets: {
    type: Array,
    default: () => []
  }
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
        <th class="border p-2">Serial Number</th>
        <th class="border p-2">Brand</th>
        <th class="border p-2">Model</th>
        <th class="border p-2">Department</th>
        <th class="border p-2">Contract</th>
        <th class="border p-2">Fiscal Year</th>
        <th class="border p-2">Action</th>
      </tr>
    </thead>

    <tbody>
      <tr
        v-for="a in assets"
        :key="a.id"
      >
        <td class="border p-2">{{ a.serial_number }}</td>
        <td class="border p-2">{{ a.brand_name }}</td>
        <td class="border p-2">{{ a.model }}</td>
        <td class="border p-2">{{ a.department_name }}</td>
        <td class="border p-2">{{ a.contract_no || '-' }}</td>
        <td class="border p-2">{{ a.fiscal_year || '-' }}</td>

        <td class="border p-2">
          <button
            class="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
            @click="onDelete(a.id)"
          >
            ลบ
          </button>
        </td>
      </tr>

      <tr v-if="assets.length === 0">
        <td
          colspan="7"
          class="text-center p-4 text-gray-500"
        >
          ไม่พบข้อมูล
        </td>
      </tr>
    </tbody>
  </table>
</template>