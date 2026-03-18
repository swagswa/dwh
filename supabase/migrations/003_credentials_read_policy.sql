-- Allow authenticated users to read credentials (check connection status)
CREATE POLICY "authenticated read credentials"
ON credentials FOR SELECT
TO authenticated
USING (true);
