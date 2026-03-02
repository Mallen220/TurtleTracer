<script lang="ts">
  import { onMount, createEventDispatcher } from "svelte";
  import { get } from "svelte/store";
  import { currentDirectoryStore } from "../../../stores";

  export let isOpen = false;

  const dispatch = createEventDispatcher();
  const electronAPI = window.electronAPI;

  let loading = false;
  let items: { name: string; type: "event" | "linked", files: string[] }[] = [];
  let editingItem: string | null = null;
  let editName = "";

  onMount(() => {
    if (isOpen) scanAllFiles();
  });

  $: if (isOpen) {
    scanAllFiles();
  }

  async function scanAllFiles() {
    const dir = get(currentDirectoryStore);
    if (!dir || !electronAPI) return;

    loading = true;
    try {
      const files = await electronAPI.listFiles(dir);
      const ppFiles = files.filter((f: any) => f.name.endsWith('.pp') && !f.isDirectory);

      const itemsMap = new Map<string, { type: "event" | "linked", files: Set<string> }>();

      for (const file of ppFiles) {
        try {
          const content = await electronAPI.readFile(file.path);
          const data = JSON.parse(content);
          
          // Scan Event Markers
          if (Array.isArray(data.lines)) {
            data.lines.forEach((line: any) => {
              if (Array.isArray(line.eventMarkers)) {
                line.eventMarkers.forEach((marker: any) => {
                  if (marker.name) {
                    const key = `event:${marker.name}`;
                    if (!itemsMap.has(key)) itemsMap.set(key, { type: "event", files: new Set() });
                    itemsMap.get(key)!.files.add(file.name);
                  }
                });
              }
              // Wait names inside lines (legacy or current depending on structure)
              if (line.waitBeforeName) {
                  const key = `linked:${line.waitBeforeName}`;
                  if (!itemsMap.has(key)) itemsMap.set(key, { type: "linked", files: new Set() });
                  itemsMap.get(key)!.files.add(file.name);
              }
              if (line.waitAfterName) {
                  const key = `linked:${line.waitAfterName}`;
                  if (!itemsMap.has(key)) itemsMap.set(key, { type: "linked", files: new Set() });
                  itemsMap.get(key)!.files.add(file.name);
              }
              if (line._linkedName || line.name) {
                  const name = line._linkedName || line.name;
                  const match = name.match(/^(.*) \(\d+\)$/);
                  const baseName = match ? match[1] : name;
                  if (baseName) {
                      const key = `linked:${baseName}`;
                      if (!itemsMap.has(key)) itemsMap.set(key, { type: "linked", files: new Set() });
                      itemsMap.get(key)!.files.add(file.name);
                  }
              }
            });
          }

          // Scan Sequence items
          if (Array.isArray(data.sequence)) {
            data.sequence.forEach((item: any) => {
               if (item.eventMarkers && Array.isArray(item.eventMarkers)) {
                   item.eventMarkers.forEach((marker: any) => {
                      if (marker.name) {
                        const key = `event:${marker.name}`;
                        if (!itemsMap.has(key)) itemsMap.set(key, { type: "event", files: new Set() });
                        itemsMap.get(key)!.files.add(file.name);
                      }
                   });
               }
               
               if (item.kind === 'wait' || item.kind === 'rotate') {
                   const name = item._linkedName || item.name;
                   if (name) {
                      const match = name.match(/^(.*) \(\d+\)$/);
                      const baseName = match ? match[1] : name;
                      if (baseName) {
                          const key = `linked:${baseName}`;
                          if (!itemsMap.has(key)) itemsMap.set(key, { type: "linked", files: new Set() });
                          itemsMap.get(key)!.files.add(file.name);
                      }
                   }
               }
            });
          }
        } catch (e) {
          console.warn("Failed to parse", file.name, e);
        }
      }

      items = Array.from(itemsMap.entries()).map(([key, val]) => ({
        name: key.substring(key.indexOf(':') + 1),
        type: val.type,
        files: Array.from(val.files)
      })).sort((a, b) => a.name.localeCompare(b.name));

    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function handleRename(oldName: string, type: "event" | "linked", newName: string) {
      if (!newName || newName === oldName) {
          editingItem = null;
          return;
      }
      
      const dir = get(currentDirectoryStore);
      if (!dir || !electronAPI) return;

      loading = true;
      try {
          const files = await electronAPI.listFiles(dir);
          const ppFiles = files.filter((f: any) => f.name.endsWith('.pp') && !f.isDirectory);
          
          for (const file of ppFiles) {
              let modified = false;
              try {
                  const content = await electronAPI.readFile(file.path);
                  const data = JSON.parse(content);
                  
                  const processName = (name: string) => {
                      if (!name) return name;
                      const match = name.match(/^(.*) (\(\d+\))$/);
                      const baseName = match ? match[1] : name;
                      const suffix = match ? ` ${match[2]}` : '';
                      if (baseName === oldName) {
                          modified = true;
                          return newName + suffix;
                      }
                      return name;
                  };
                  
                  if (Array.isArray(data.lines)) {
                      data.lines.forEach((line: any) => {
                          if (type === "event" && Array.isArray(line.eventMarkers)) {
                              line.eventMarkers.forEach((marker: any) => {
                                  if (marker.name === oldName) {
                                      marker.name = newName;
                                      modified = true;
                                  }
                              });
                          }
                          if (type === "linked") {
                              if (line.waitBeforeName) line.waitBeforeName = processName(line.waitBeforeName);
                              if (line.waitAfterName) line.waitAfterName = processName(line.waitAfterName);
                              if (line._linkedName) line._linkedName = processName(line._linkedName);
                              if (line.name) line.name = processName(line.name);
                          }
                      });
                  }
                  
                  if (Array.isArray(data.sequence)) {
                      data.sequence.forEach((item: any) => {
                          if (type === "event" && item.eventMarkers && Array.isArray(item.eventMarkers)) {
                              item.eventMarkers.forEach((marker: any) => {
                                  if (marker.name === oldName) {
                                      marker.name = newName;
                                      modified = true;
                                  }
                              });
                          }
                          if (type === "linked" && (item.kind === 'wait' || item.kind === 'rotate')) {
                              if (item._linkedName) item._linkedName = processName(item._linkedName);
                              if (item.name) item.name = processName(item.name);
                          }
                      });
                  }
                  
                  if (modified) {
                      await electronAPI.writeFile(file.path, JSON.stringify(data, null, 2));
                  }
              } catch (e) {
                  console.warn("Failed to process file for rename", file.name, e);
              }
          }
          await scanAllFiles();
          dispatch("refresh-browser");
      } catch (e) {
          console.error(e);
      } finally {
          loading = false;
          editingItem = null;
      }
  }

  async function handleDelete(oldName: string, type: "event" | "linked") {
      if (!confirm(`Are you sure you want to remove "${oldName}" from all paths? Note: Empty markers may cause warnings.`)) return;
      
      const dir = get(currentDirectoryStore);
      if (!dir || !electronAPI) return;

      loading = true;
      try {
          const files = await electronAPI.listFiles(dir);
          const ppFiles = files.filter((f: any) => f.name.endsWith('.pp') && !f.isDirectory);
          
          for (const file of ppFiles) {
              let modified = false;
              let emptyWarningAdded = false;
              try {
                  const content = await electronAPI.readFile(file.path);
                  const data = JSON.parse(content);
                  
                  const processName = (name: string) => {
                      if (!name) return name;
                      const match = name.match(/^(.*) (\(\d+\))$/);
                      const baseName = match ? match[1] : name;
                      if (baseName === oldName) {
                          modified = true;
                          emptyWarningAdded = true;
                          return "";
                      }
                      return name;
                  };
                  
                  if (Array.isArray(data.lines)) {
                      data.lines.forEach((line: any) => {
                          if (type === "event" && Array.isArray(line.eventMarkers)) {
                              line.eventMarkers.forEach((marker: any) => {
                                  if (marker.name === oldName) {
                                      marker.name = "";
                                      modified = true;
                                      emptyWarningAdded = true;
                                  }
                              });
                          }
                          if (type === "linked") {
                              if (line.waitBeforeName) line.waitBeforeName = processName(line.waitBeforeName);
                              if (line.waitAfterName) line.waitAfterName = processName(line.waitAfterName);
                              if (line._linkedName) line._linkedName = processName(line._linkedName);
                              if (line.name) line.name = processName(line.name);
                          }
                      });
                  }
                  
                  if (Array.isArray(data.sequence)) {
                      data.sequence.forEach((item: any) => {
                          if (type === "event" && item.eventMarkers && Array.isArray(item.eventMarkers)) {
                              item.eventMarkers.forEach((marker: any) => {
                                  if (marker.name === oldName) {
                                      marker.name = "";
                                      modified = true;
                                      emptyWarningAdded = true;
                                  }
                              });
                          }
                          if (type === "linked" && (item.kind === 'wait' || item.kind === 'rotate')) {
                              if (item._linkedName) item._linkedName = processName(item._linkedName);
                              if (item.name) item.name = processName(item.name);
                          }
                      });
                  }
                  
                  if (modified) {
                      if (emptyWarningAdded) {
                          data._hasEmptyMarkerWarning = true;
                      }
                      await electronAPI.writeFile(file.path, JSON.stringify(data, null, 2));
                  }
              } catch (e) {
                  console.warn("Failed to process file for delete", file.name, e);
              }
          }
          await scanAllFiles();
          dispatch("refresh-browser");
      } catch (e) {
          console.error(e);
      } finally {
          loading = false;
      }
  }

  function startEdit(item: any) {
      editingItem = `${item.type}:${item.name}`;
      editName = item.name;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
        <h2 class="text-xl font-bold text-neutral-900 dark:text-white">Manage Global Items</h2>
        <button on:click={() => (isOpen = false)} class="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="flex-1 overflow-auto p-4">
        {#if loading}
           <div class="flex justify-center p-8 text-neutral-500">Scanning files...</div>
        {:else if items.length === 0}
           <div class="flex justify-center p-8 text-neutral-500">No named events or linked waypoints found.</div>
        {:else}
           <div class="grid grid-cols-1 gap-2">
             {#each items as item}
               <div class="flex items-center justify-between p-3 border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                 <div class="flex-1">
                   {#if editingItem === `${item.type}:${item.name}`}
                     <input
                       type="text"
                       bind:value={editName}
                       class="px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none dark:bg-neutral-700 w-full max-w-xs"
                       on:keydown={(e) => {
                         if (e.key === 'Enter') handleRename(item.name, item.type, editName);
                         if (e.key === 'Escape') editingItem = null;
                       }}
                     />
                   {:else}
                     <div class="font-medium text-neutral-900 dark:text-neutral-100">
                       {item.name}
                       <span class="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                         {item.type === 'event' ? 'Event Marker' : 'Linked Waypoint'}
                       </span>
                     </div>
                     <div class="text-xs text-neutral-500 mt-1">Used in {item.files.length} file{item.files.length === 1 ? '' : 's'}</div>
                   {/if}
                 </div>
                 
                 <div class="flex gap-2 ml-4">
                   {#if editingItem === `${item.type}:${item.name}`}
                      <button on:click={() => handleRename(item.name, item.type, editName)} class="p-1.5 bg-green-500 text-white rounded hover:bg-green-600" title="Save">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                      </button>
                      <button on:click={() => editingItem = null} class="p-1.5 bg-neutral-400 text-white rounded hover:bg-neutral-500" title="Cancel">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                      </button>
                   {:else}
                      <button on:click={() => startEdit(item)} class="p-1.5 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30 rounded transition-colors" title="Rename">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                      </button>
                      <button on:click={() => handleDelete(item.name, item.type)} class="p-1.5 text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30 rounded transition-colors" title="Delete from all paths">
                         <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="size-4"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                   {/if}
                 </div>
               </div>
             {/each}
           </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
