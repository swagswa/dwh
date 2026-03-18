-- Allow authenticated users to delete documents
CREATE POLICY "authenticated delete documents"
ON documents FOR DELETE
TO authenticated
USING (true);
