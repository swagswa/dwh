-- Create storage bucket for file uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to read their uploads
CREATE POLICY "authenticated read storage"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Allow service_role full access (Edge Functions use service_role)
-- service_role bypasses RLS by default, so no explicit policy needed
