-- Allow authenticated users to manage credentials (save OAuth tokens, site URLs)
CREATE POLICY "authenticated write credentials"
ON credentials FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "authenticated update credentials"
ON credentials FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "authenticated delete credentials"
ON credentials FOR DELETE
TO authenticated
USING (true);
