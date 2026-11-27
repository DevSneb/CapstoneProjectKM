<template>
  <div class="page">
    <div class="page-head">
      <h2>Maps</h2>
      <p class="lead">Set your store pin on Google Maps so customers can find you.</p>
    </div>

    <div v-if="mapError" class="map-error">{{ mapError }}</div>

    <div class="layout">
      <div class="map-panel">
        <div class="toolbar">
          <label>Map type
            <select class="select" v-model="mapTypeId" @change="switchMapType">
              <option value="roadmap">Roadmap</option>
              <option value="satellite">Satellite</option>
              <option value="hybrid">Hybrid</option>
              <option value="terrain">Terrain</option>
            </select>
          </label>
          <button type="button" class="ghost-btn" @click="useMyLocation">Use my location</button>
        </div>
        <div id="ownerMap" class="map"></div>
        <p class="hint">Click the map or drag the pin to set your store location.</p>
      </div>

      <div class="side-panel">
        <h3>Location details</h3>
        <div class="form">
          <label>Latitude
            <input class="input" v-model.number="latitude" type="number" step="0.000001" @change="syncMarkerFromInputs" />
          </label>
          <label>Longitude
            <input class="input" v-model.number="longitude" type="number" step="0.000001" @change="syncMarkerFromInputs" />
          </label>
          <label>Address (optional)
            <textarea class="input" v-model="address" rows="3" placeholder="Street, barangay, city"></textarea>
          </label>
          <button class="primary-btn" @click="save" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save location' }}
          </button>
        </div>
        <div v-if="savedPreview" class="saved-note">
          Saved pin: {{ savedPreview }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../../services/api'
import loadGoogleMaps from '../../services/googleMapsLoader'

const CALAPAN = { lat: 13.4117, lng: 121.1803 }

export default {
  name: 'StoreAccountLocation',
  data() {
    return {
      latitude: null,
      longitude: null,
      address: '',
      mapInstance: null,
      markerInstance: null,
      mapTypeId: 'roadmap',
      mapError: '',
      saving: false
    }
  },
  computed: {
    savedPreview() {
      if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) return ''
      return `${Number(this.latitude).toFixed(5)}, ${Number(this.longitude).toFixed(5)}`
    }
  },
  async mounted() {
    await this.load()
    await this.initMap()
  },
  methods: {
    async load() {
      try {
        const { data } = await api.get('/store/account/location')
        this.latitude = data.latitude ?? null
        this.longitude = data.longitude ?? null
        this.address = data.address || ''
      } catch (err) {
        console.error('Failed to load location', err)
      }
    },
    async initMap() {
      this.mapError = ''
      try {
        const maps = await loadGoogleMaps()
        const el = document.getElementById('ownerMap')
        if (!el) return

        const hasCoords = Number.isFinite(this.latitude) && Number.isFinite(this.longitude)
        const center = hasCoords
          ? { lat: Number(this.latitude), lng: Number(this.longitude) }
          : CALAPAN

        this.mapInstance = new maps.Map(el, {
          center,
          zoom: hasCoords ? 15 : 13,
          mapTypeId: this.mapTypeId,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true
        })

        if (hasCoords) this.placeMarker(center, maps)

        this.mapInstance.addListener('click', (e) => {
          const lat = Number(e.latLng.lat().toFixed(6))
          const lng = Number(e.latLng.lng().toFixed(6))
          this.latitude = lat
          this.longitude = lng
          this.placeMarker({ lat, lng }, maps)
        })
      } catch (err) {
        console.error(err)
        this.mapError = err.message || 'Failed to load Google Maps'
      }
    },
    placeMarker(position, mapsApi) {
      const maps = mapsApi || window.google?.maps
      if (!maps || !this.mapInstance) return

      if (this.markerInstance) {
        this.markerInstance.setPosition(position)
        return
      }

      this.markerInstance = new maps.Marker({
        position,
        map: this.mapInstance,
        draggable: true,
        title: 'Store location'
      })
      this.markerInstance.addListener('dragend', () => {
        const pos = this.markerInstance.getPosition()
        this.latitude = Number(pos.lat().toFixed(6))
        this.longitude = Number(pos.lng().toFixed(6))
      })
    },
    switchMapType() {
      if (this.mapInstance) this.mapInstance.setMapTypeId(this.mapTypeId)
    },
    syncMarkerFromInputs() {
      if (!this.mapInstance || !Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) return
      const position = { lat: Number(this.latitude), lng: Number(this.longitude) }
      this.placeMarker(position)
      this.mapInstance.panTo(position)
    },
    useMyLocation() {
      if (!navigator.geolocation) {
        alert('Geolocation is not supported on this device')
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.latitude = Number(pos.coords.latitude.toFixed(6))
          this.longitude = Number(pos.coords.longitude.toFixed(6))
          const position = { lat: this.latitude, lng: this.longitude }
          this.placeMarker(position)
          if (this.mapInstance) {
            this.mapInstance.panTo(position)
            this.mapInstance.setZoom(16)
          }
        },
        () => alert('Could not get your current location'),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    },
    async save() {
      if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) {
        alert('Click the map to set a store pin first')
        return
      }
      this.saving = true
      try {
        await api.put('/store/account/location', {
          latitude: this.latitude,
          longitude: this.longitude,
          address: this.address
        })
        alert('Store location saved')
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to save location')
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.page { padding: 4px 2px 20px; }
.page-head h2 { margin: 0; color: #2f5a23; }
.lead { margin: 6px 0 0; color: #5f7256; max-width: 62ch; }
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.8fr);
  gap: 16px;
  align-items: start;
  margin-top: 14px;
}
.map-panel,
.side-panel {
  background: #fff;
  border: 1px solid #deead0;
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 8px 20px rgba(56, 92, 35, 0.07);
}
.side-panel h3 {
  margin: 0 0 12px;
  color: #2f5a23;
  font-size: 15px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: end;
  margin-bottom: 10px;
}
.toolbar label {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: #48603b;
  font-weight: 600;
}
.map {
  height: 420px;
  border: 1px solid #d9e5c8;
  border-radius: 10px;
  overflow: hidden;
}
.hint {
  margin: 8px 0 0;
  color: #6a7b60;
  font-size: 13px;
}
.map-error {
  margin-top: 12px;
  margin-bottom: 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff1f1;
  border: 1px solid #f4c8c8;
  color: #b42318;
  font-size: 13px;
}
.form { display: grid; gap: 10px; }
.form label {
  display: grid;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: #48603b;
}
.input, .select {
  padding: 9px 10px;
  border: 1px solid #cddbb9;
  border-radius: 8px;
  background: #fff;
  font-weight: 500;
}
.primary-btn {
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  color: #fff;
  border: none;
  padding: 11px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
}
.primary-btn:disabled { opacity: 0.7; cursor: default; }
.ghost-btn {
  border: 1px solid #cddbb9;
  background: #f7faf2;
  color: #355e2a;
  border-radius: 8px;
  padding: 9px 12px;
  cursor: pointer;
  font-weight: 600;
}
.saved-note {
  margin-top: 12px;
  padding: 10px;
  border-radius: 8px;
  background: #f4f8ee;
  color: #355e2a;
  font-size: 13px;
}
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .map { height: 280px; }
}
</style>
