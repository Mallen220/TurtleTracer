import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import RobotProfileManagerWrapper from './RobotProfileManagerWrapper.svelte';
import { robotProfilesStore } from "../../../lib/projectStore";
import { notification } from "../../../stores";

vi.mock("../../../lib/projectStore", () => ({
    robotProfilesStore: {
        subscribe: vi.fn(),
        update: vi.fn(),
        set: vi.fn()
    }
}));

vi.mock("../../../stores", () => ({
    notification: {
        set: vi.fn()
    }
}));

describe('RobotProfileManager', () => {
    let mockProfiles: any[] = [];
    let subscriber: any;

    const baseSettings = {
        rLength: 10,
        rWidth: 10,
        maxVelocity: 50,
        maxAcceleration: 50,
        maxDeceleration: 50,
        maxAngularAcceleration: 50,
        kFriction: 1,
        aVelocity: 1,
        xVelocity: 1,
        yVelocity: 1,
        showRobotArrows: true,
        showFakeHeadingArrow: false,
        fakeHeadingArrowColor: "#ff0000"
    };

    beforeEach(() => {
        mockProfiles = [];
        vi.mocked(robotProfilesStore.subscribe).mockImplementation((cb) => {
            subscriber = cb;
            cb(mockProfiles);
            return () => {};
        });
        vi.mocked(robotProfilesStore.update).mockImplementation((cb) => {
            mockProfiles = cb(mockProfiles);
            if (subscriber) subscriber(mockProfiles);
        });
        vi.mocked(robotProfilesStore.set).mockImplementation((v) => {
            mockProfiles = v;
            if (subscriber) subscriber(mockProfiles);
        });

        // Mock window.confirm
        window.confirm = vi.fn(() => true);
        window.URL.createObjectURL = vi.fn(() => 'mock-url');
        window.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders empty state correctly', () => {
        const { getByText } = render(RobotProfileManagerWrapper, { props: { settings: { ...baseSettings } } });
        expect(getByText('Robot Profiles')).toBeDefined();
        expect(getByText('No saved profiles yet.')).toBeDefined();
        expect(getByText('+ New Profile')).toBeDefined();
    });

    it('handles creating a new profile', async () => {
        const { getByText, container } = render(RobotProfileManagerWrapper, { props: { settings: { ...baseSettings } } });

        // Click new profile
        await fireEvent.click(getByText('+ New Profile'));

        const input = container.querySelector('#profile-name') as HTMLInputElement;
        await fireEvent.input(input, { target: { value: 'My Robot' } });

        // Save (button text: "Save Current Settings")
        const saveBtn = getByText('Save Current Settings');
        await fireEvent.click(saveBtn);

        expect(mockProfiles.length).toBe(1);
        expect(mockProfiles[0].name).toBe('My Robot');
        expect(mockProfiles[0].rLength).toBe(10);
        expect(notification.set).toHaveBeenCalledWith({ message: 'Profile "My Robot" created', type: 'success' });
    });

    it('requires a profile name when creating', async () => {
        const { getByText } = render(RobotProfileManagerWrapper, { props: { settings: { ...baseSettings } } });

        // Click new profile
        await fireEvent.click(getByText('+ New Profile'));

        // Save without typing name
        const saveBtn = getByText('Save Current Settings');
        await fireEvent.click(saveBtn);

        expect(mockProfiles.length).toBe(0);
        expect(notification.set).toHaveBeenCalledWith({ message: 'Please enter a profile name', type: 'warning' });
    });

    it('displays profiles and can load them', async () => {
        mockProfiles = [
            { id: '1', name: 'Profile 1', maxVelocity: 100 },
            { id: '2', name: 'Profile 2', maxVelocity: 200 }
        ];

        const mockSettingsChange = vi.fn();
        const settings = { ...baseSettings };
        const { getByText, getByRole } = render(RobotProfileManagerWrapper, { props: { settings, onSettingsChange: mockSettingsChange } });

        const select = getByRole('combobox');

        // Select profile 2
        await fireEvent.change(select, { target: { value: '2' } });

        // Load profile 2
        const loadBtn = getByText('Load');
        await fireEvent.click(loadBtn);

        expect(window.confirm).toHaveBeenCalled();
        expect(settings.maxVelocity).toBe(200);
        expect(mockSettingsChange).toHaveBeenCalled();
        expect(notification.set).toHaveBeenCalledWith({ message: 'Profile "Profile 2" applied', type: 'success' });
    });

    it('can delete profile', async () => {
        mockProfiles = [
            { id: '1', name: 'Profile 1' },
            { id: '2', name: 'Profile 2' }
        ];

        const { getByRole, getByTitle, getByLabelText } = render(RobotProfileManagerWrapper, { props: { settings: { ...baseSettings } } });

        const select = getByRole('combobox');
        await fireEvent.change(select, { target: { value: '1' } });

        const deleteBtn = getByTitle('Delete Profile');
        await fireEvent.click(deleteBtn);

        await waitFor(() => {
             expect(getByLabelText("Confirm Deletion")).toBeDefined();
        });

        const confirmBtn = getByLabelText("Confirm Deletion");
        await fireEvent.click(confirmBtn);

        expect(mockProfiles.length).toBe(1);
        expect(mockProfiles[0].id).toBe('2');
        expect(notification.set).toHaveBeenCalledWith({ message: 'Profile "Profile 1" deleted', type: 'success' });
    });

    it('can update profile with current settings', async () => {
        mockProfiles = [
            { id: '1', name: 'Profile 1', maxVelocity: 100 },
            { id: '2', name: 'Profile 2', maxVelocity: 200 }
        ];

        // Settings has maxVelocity = 50
        const { getByRole, getByTitle } = render(RobotProfileManagerWrapper, { props: { settings: { ...baseSettings } } });

        const select = getByRole('combobox');
        await fireEvent.change(select, { target: { value: '1' } });

        const updateBtn = getByTitle('Overwrite profile with current settings');

        // First click shows confirmation state
        await fireEvent.click(updateBtn);

        // Second click updates
        await fireEvent.click(updateBtn);

        expect(mockProfiles[0].maxVelocity).toBe(50);
        expect(notification.set).toHaveBeenCalledWith({ message: 'Profile "Profile 1" updated', type: 'success' });
    });

    it('can export profile', async () => {
        mockProfiles = [
            { id: '1', name: 'Profile 1', maxVelocity: 100 }
        ];

        const mockLink = {
            href: '',
            download: '',
            click: vi.fn(),
            remove: vi.fn(),
            setAttribute: function(k: string, v: string) { (this as any)[k] = v; }
        };
        const origCreateElement = document.createElement.bind(document);
        vi.spyOn(document, "createElement").mockImplementation((tag) => tag === "a" ? mockLink as any : origCreateElement(tag));

        const origAppendChild = document.body.appendChild.bind(document.body);
        vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
            if(node === mockLink) return node as any;
            return origAppendChild(node);
        });

        const { getByRole, getByTitle } = render(RobotProfileManagerWrapper, { props: { settings: { ...baseSettings } } });

        const select = getByRole('combobox');
        await fireEvent.change(select, { target: { value: '1' } });

        const exportBtn = getByTitle('Export Profile');
        await fireEvent.click(exportBtn);

        expect(mockLink.download).toBe('robot-profile-profile_1.json');
        expect(mockLink.href).toBe('mock-url');
        expect(mockLink.click).toHaveBeenCalled();
    });

    it('handles import profile', async () => {
        const { getByText, container } = render(RobotProfileManagerWrapper, { props: { settings: { ...baseSettings } } });

        const originalFileReader = window.FileReader;
        window.FileReader = class FileReader {
            onload: any;
            readAsText() {
                this.onload({ target: { result: JSON.stringify({ name: "Imported Robot", maxVelocity: 300 }) } });
            }
        } as any;

        const input = container.querySelector('#profile-import-input') as HTMLInputElement;
        const file = new File(["dummy"], "profile.json", { type: "application/json" });
        Object.defineProperty(input, 'files', { value: [file] });

        await fireEvent.change(input);

        expect(mockProfiles.length).toBe(1);
        expect(mockProfiles[0].name).toBe("Imported Robot (Imported)");
        expect(mockProfiles[0].maxVelocity).toBe(300);
        expect(notification.set).toHaveBeenCalledWith({ message: `Profile "Imported Robot (Imported)" imported successfully`, type: "success", timeout: 3000 });

        window.FileReader = originalFileReader;
    });

    it('handles import profile validation error', async () => {
        const { getByText, container } = render(RobotProfileManagerWrapper, { props: { settings: { ...baseSettings } } });

        const originalFileReader = window.FileReader;
        window.FileReader = class FileReader {
            onload: any;
            readAsText() {
                this.onload({ target: { result: JSON.stringify({ name: "Imported Robot" }) } });
            }
        } as any;

        const input = container.querySelector('#profile-import-input') as HTMLInputElement;
        const file = new File(["dummy"], "profile.json", { type: "application/json" });
        Object.defineProperty(input, 'files', { value: [file] });

        await fireEvent.change(input);

        expect(mockProfiles.length).toBe(0);
        expect(notification.set).toHaveBeenCalledWith({ message: "Error importing profile: Invalid robot profile format.", type: "error" });

        window.FileReader = originalFileReader;
    });
});
