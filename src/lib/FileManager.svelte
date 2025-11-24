<script lang="ts">
  import { onMount, afterUpdate } from 'svelte';
  import { cubicInOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import type { FileInfo } from '../types';
  import { currentFilePath, isUnsaved } from "../stores"; // Import new stores
  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  
  let currentDirectory = '';
  let files: FileInfo[] = [];
  let loading = false;
  let newFileName = '';
  let creatingNewFile = false;
  let selectedFile: FileInfo | null = null;

  declare const electronAPI: {
    getDirectory: () => Promise<string>;
    setDirectory: () => Promise<string | null>;
    listFiles: (directory: string) => Promise<FileInfo[]>;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<boolean>;
    deleteFile: (filePath: string) => Promise<boolean>;
    fileExists: (filePath: string) => Promise<boolean>;
  };

  async function loadDirectory() {
    loading = true;
    try {
      currentDirectory = await electronAPI.getDirectory();
      files = await electronAPI.listFiles(currentDirectory);
    } catch (error) {
      console.error('Error loading directory:', error);
    }
    loading = false;
  }

  async function changeDirectory() {
    const newDir = await electronAPI.setDirectory();
    if (newDir) {
      currentDirectory = newDir;
      await loadDirectory();
    }
  }

async function loadFile(file: FileInfo) {
    try {
      const content = await electronAPI.readFile(file.path);
      const data = JSON.parse(content);
      
      // Update the application state
      startPoint = data.startPoint;
      lines = data.lines;
      shapes = data.shapes || [];
      
      // NEW: Update Global Store State
      currentFilePath.set(file.path);
      isUnsaved.set(false); // Reset dirty flag
      
      selectedFile = file;
      
      // Close the manager (optional UX improvement)
      // isOpen = false; 
    } catch (error) {
      console.error('Error loading file:', error);
      alert('Error loading file: ' + error.message);
    }
  }

  async function saveCurrentToFile() {
    if (!selectedFile) return;
    try {
      const content = JSON.stringify({ startPoint, lines, shapes });
      await electronAPI.writeFile(selectedFile.path, content);
      await loadDirectory();
      
      // NEW: Reset dirty state
      isUnsaved.set(false);
      
    } catch (error) {
      console.error('Error saving file:', error);
      alert('Error saving file: ' + error.message);
    }
  }

  async function createNewFile() {
    if (!newFileName.trim()) return;
    
    const fileName = newFileName.endsWith('.pp') ? newFileName : newFileName + '.pp';
    const filePath = path.join(currentDirectory, fileName);
    
    // Check if file exists
    const exists = await electronAPI.fileExists(filePath);
    if (exists) {
      if (!confirm(`File "${fileName}" already exists. Overwrite?`)) {
        return;
      }
    }
    
    // inside try block
    try {
      const content = JSON.stringify({ startPoint, lines, shapes });
      await electronAPI.writeFile(filePath, content);
      
      creatingNewFile = false;
      newFileName = '';
      await loadDirectory();
      
      // NEW: Automatically "load" the new file into state
      selectedFile = files.find(f => f.name === fileName) || null;
      if (selectedFile) {
          currentFilePath.set(selectedFile.path);
          isUnsaved.set(false);
      }
    } catch (error) {
      console.error('Error creating file:', error);
      alert('Error creating file: ' + error.message);
    }
  }

  async function deleteFile(file: FileInfo) {
    if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
      return;
    }
    
    try {
      await electronAPI.deleteFile(file.path);
      if (selectedFile?.path === file.path) {
        selectedFile = null;
      }
      await loadDirectory();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Error deleting file: ' + error.message);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString() + ' ' + new Date(date).toLocaleTimeString();
  }

  onMount(() => {
    loadDirectory();
  });

  // Mock path.join for browser context
  const path = {
    join: (...parts: string[]) => parts.join('/')
  };
</script>

<div
  class="fixed inset-0 z-[1010] flex"
  class:pointer-events-none={!isOpen}
>
  <!-- Backdrop -->
  {#if isOpen}
    <div
      transition:fade={{ duration: 300 }}
      class="fixed inset-0 bg-black bg-opacity-50"
      on:click={() => isOpen = false}
    />
  {/if}

  <!-- Sidebar -->
  <div
    class="w-80 h-full bg-white dark:bg-neutral-900 shadow-xl transform transition-transform duration-300 ease-in-out"
    class:translate-x-0={isOpen}
    class:-translate-x-full={!isOpen}
  >
    <div class="flex flex-col h-full">
      <!-- Header -->
      <div class="flex-shrink-0 p-4 border-b border-neutral-200 dark:border-neutral-700">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold text-neutral-900 dark:text-white">
            File Manager
          </h2>
          <button
            on:click={() => isOpen = false}
            class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <!-- Directory Info -->
        <div class="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
          Directory: 
          <div class="truncate font-mono text-xs" title={currentDirectory}>
            {currentDirectory.split('/').pop()}
          </div>
        </div>
        
        <button
          on:click={changeDirectory}
          class="w-full px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
          </svg>
          Change Directory
        </button>
      </div>

      <!-- New File Section -->
      <div class="flex-shrink-0 p-4 border-b border-neutral-200 dark:border-neutral-700">
        {#if creatingNewFile}
          <div class="space-y-2">
            <input
              bind:value={newFileName}
              placeholder="Enter file name..."
              class="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-neutral-600 rounded-md bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              on:keydown={(e) => e.key === 'Enter' && createNewFile()}
            />
            <div class="flex gap-2">
              <button
                on:click={createNewFile}
                class="flex-1 px-3 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors"
              >
                Create
              </button>
              <button
                on:click={() => {
                  creatingNewFile = false;
                  newFileName = '';
                }}
                class="flex-1 px-3 py-2 text-sm bg-neutral-500 hover:bg-neutral-600 text-white rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        {:else}
          <button
            on:click={() => creatingNewFile = true}
            class="w-full px-3 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New File
          </button>
        {/if}
      </div>

      <!-- File List -->
      <div class="flex-1 overflow-hidden">
        {#if loading}
          <div class="flex items-center justify-center h-32">
            <div class="text-neutral-500 dark:text-neutral-400">Loading files...</div>
          </div>
        {:else if files.length === 0}
          <div class="flex items-center justify-center h-32">
            <div class="text-center text-neutral-500 dark:text-neutral-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={1} stroke="currentColor" class="size-12 mx-auto mb-2 opacity-50">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              No .pp files found
            </div>
          </div>
        {:else}
          <div class="h-full overflow-y-auto">
            {#each files as file (file.path)}
              <div
                class="p-3 border-b border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                on:click={() => loadFile(file)}
              >
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={1.5} stroke="currentColor" class="size-4 text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                      </svg>
                      <div class="font-medium text-sm truncate text-neutral-900 dark:text-white">
                        {file.name}
                      </div>
                    </div>
                    <div class="text-xs text-neutral-500 dark:text-neutral-400 space-y-1">
                      <div>{formatFileSize(file.size)}</div>
                      <div>Modified: {formatDate(file.modified)}</div>
                    </div>
                  </div>
                  <button
                    on:click|stopPropagation={() => deleteFile(file)}
                    class="p-1 rounded hover:bg-red-500 hover:text-white transition-colors ml-2 flex-shrink-0"
                    title="Delete file"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={1.5} stroke="currentColor" class="size-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Current File Actions -->
      {#if selectedFile}
        <div class="flex-shrink-0 p-4 border-t border-neutral-200 dark:border-neutral-700">
          <div class="text-sm font-medium text-neutral-900 dark:text-white mb-2 truncate" title={selectedFile.name}>
            {selectedFile.name}
          </div>
          <!-- <button
            on:click={saveCurrentToFile}
            class="w-full px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors flex items-center justify-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width={2} stroke="currentColor" class="size-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            Save Current to File
          </button> -->
        </div>
      {/if}
    </div>
  </div>
</div>