<script setup>
defineProps({
  assets: {
    type: Array,
    default: () => []
  },
  // ซ่อนปุ่มแก้ไข/ลบสำหรับ role ที่ไม่ใช่ admin
  canManage: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['delete', 'edit'])

const statusLabel = {
  active: "ใช้งาน",
  repair: "ซ่อม",
  retired: "ปลดระวาง",
}

const statusClass = {
  active: "bg-green-100 text-green-700",
  repair: "bg-yellow-100 text-yellow-700",
  retired: "bg-gray-200 text-gray-600",
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
        <th class="border p-2">สถานะ</th>
        <th v-if="canManage" class="border p-2">Action</th>
      </tr>
    </thead>

    <tbody>
      <tr
        v-for="a in assets"
        :key="a.id"
      >
        <td class="border p-2">{{ a.serial_number }}</td>
        <td class="border p-2">{{ a.brand_name || '-' }}</td>
        <td class="border p-2">{{ a.model || '-' }}</td>
        <td class="border p-2">{{ a.department_name || '-' }}</td>
        <td class="border p-2">{{ a.contract_no || '-' }}</td>
        <td class="border p-2">{{ a.fiscal_year || '-' }}</td>

        <td class="border p-2 text-center">
          <span
            class="px-2 py-1 rounded text-sm"
            :class="statusClass[a.status] || 'bg-gray-100'"
          >
            {{ statusLabel[a.status] || a.status || '-' }}
          </span>
        </td>

        <td v-if="canManage" class="border p-2 text-center space-x-2">
          <button
            class="bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600"
            @click="emit('edit', a.id)"
          >
            แก้ไข
          </button>
          <button
            class="bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700"
            @click="emit('delete', a.id)"
          >
            ลบ
          </button>
        </td>
      </tr>

      <tr v-if="assets.length === 0">
        <td
          :colspan="canManage ? 8 : 7"
          class="text-center p-4 text-gray-500"
        >
          ไม่พบข้อมูล
        </td>
      </tr>
    </tbody>
  </table>
</template>
