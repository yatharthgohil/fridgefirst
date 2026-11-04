"use client";

import React from "react";
import { Modal, Button, Icon } from "@/components";

export interface ScanUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotosSelected: (files: FileList | null) => void;
}

export function ScanUploadModal({
  isOpen,
  onClose,
  onPhotosSelected,
}: ScanUploadModalProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onPhotosSelected(e.target.files);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="upload-modal"
      titleId="upload-title"
      showCloseButton
    >
      <div className="modal-icon">
        <Icon name="camera" size={28} />
      </div>
      <h2 id="upload-title">Add groceries from a photo</h2>
      <p>
        Upload a clear photo and we’ll identify the items for you to review before
        anything is saved.
      </p>
      <label className="drop-zone">
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.heic"
          multiple
          onChange={handleFileChange}
        />
        <Icon name="camera" size={28} />
        <strong>Drop photos here or choose files</strong>
        <span>JPEG, PNG or HEIC · up to 10 photos</span>
      </label>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
    </Modal>
  );
}
