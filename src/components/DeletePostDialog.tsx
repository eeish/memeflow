import React from 'react';
import { Button } from './ui-simple/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui-simple/Dialog';
import { Alert, AlertDescription } from './ui-simple/Alert';
import { Trash2, Loader2, AlertTriangle } from './ui-simple/Icons';

interface DeletePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postContent: string;
  onConfirm: () => void;
  isDeleting: boolean;
  error?: string | null;
}

export const DeletePostDialog: React.FC<DeletePostDialogProps> = ({
  open,
  onOpenChange,
  postContent,
  onConfirm,
  isDeleting,
  error,
}) => {
  const truncatedContent = postContent.length > 100
    ? postContent.slice(0, 100) + '...'
    : postContent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            Delete Post?
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            This will remove the post from Cord. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Post Preview */}
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
              "{truncatedContent}"
            </p>
          </div>

          {/* Attestation Warning */}
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500 mt-0.5" />
            <p>On-chain attestation will remain. The post hash can still be verified on the blockchain.</p>
          </div>

          {/* Error Display */}
          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-700">{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="border-gray-300"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isDeleting}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
